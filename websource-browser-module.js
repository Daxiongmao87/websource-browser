#!/usr/bin/env node

/**
 * @file websource-browser-module.js
 * @description Module version of WebSourceBrowser for MCP integration
 */

import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer';
import { createServer, createConnection } from 'net';

const DEBUG_MODE = process.env.DEBUG === 'true';

class WebSourceLogger {
  constructor(debugMode = false) {
    this.debugMode = debugMode;
    if (this.debugMode) {
      console.log('[WebSource Browser] [Debug] 🐛 DEBUG MODE ENABLED - Verbose output enabled');
    }
  }

  success(message) {
    console.log(`[WebSource Browser] ✅ ${message}`);
  }

  warn(message) {
    console.warn(`[WebSource Browser] ⚠️ ${message}`);
  }

  error(message) {
    console.error(`[WebSource Browser] ❌ ${message}`);
  }

  info(message) {
    console.log(`[WebSource Browser] 📋 ${message}`);
  }

  debug(message) {
    if (this.debugMode) {
      console.log(`[WebSource Browser] [Debug] 🔍 ${message}`);
    }
  }
}

class SessionManager {
  constructor(logger) {
    this.logger = logger;
    this.sessionsDir = join(homedir(), '.local', 'lib', 'websource-browser', 'sessions');
    this.ensureSessionsDir();
  }

  ensureSessionsDir() {
    if (!existsSync(this.sessionsDir)) {
      mkdirSync(this.sessionsDir, { recursive: true });
      this.logger.debug(`Created sessions directory: ${this.sessionsDir}`);
    }
  }

  getSessionFile(sessionName) {
    return join(this.sessionsDir, `${sessionName}.json`);
  }

  sessionExists(sessionName) {
    return existsSync(this.getSessionFile(sessionName));
  }

  createSession(sessionName, wsEndpoint, pid, headless = true) {
    const sessionData = {
      name: sessionName,
      wsEndpoint: wsEndpoint,
      pid: pid,
      headless: headless,
      created: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      currentUrl: null
    };
    
    writeFileSync(this.getSessionFile(sessionName), JSON.stringify(sessionData, null, 2));
    this.logger.debug(`Session created: ${sessionName} (PID: ${pid})`);
    return sessionData;
  }

  getSession(sessionName) {
    const sessionFile = this.getSessionFile(sessionName);
    if (!existsSync(sessionFile)) {
      return null;
    }
    
    try {
      return JSON.parse(readFileSync(sessionFile, 'utf8'));
    } catch (error) {
      this.logger.error(`Failed to read session ${sessionName}: ${error.message}`);
      return null;
    }
  }

  updateSession(sessionName, updates) {
    const session = this.getSession(sessionName);
    if (!session) return false;
    
    const updatedSession = { ...session, ...updates };
    writeFileSync(this.getSessionFile(sessionName), JSON.stringify(updatedSession, null, 2));
    return true;
  }

  updateSessionActivity(sessionName) {
    return this.updateSession(sessionName, { lastActivity: new Date().toISOString() });
  }

  deleteSession(sessionName) {
    const sessionFile = this.getSessionFile(sessionName);
    if (existsSync(sessionFile)) {
      unlinkSync(sessionFile);
      this.logger.debug(`Session deleted: ${sessionName}`);
      return true;
    }
    return false;
  }

  listSessions() {
    if (!existsSync(this.sessionsDir)) {
      return [];
    }
    
    const sessions = [];
    const files = readdirSync(this.sessionsDir);
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const sessionName = file.replace('.json', '');
        const session = this.getSession(sessionName);
        if (session) {
          sessions.push(session);
        }
      }
    }
    
    return sessions;
  }

  async isSessionActive(sessionName) {
    const session = this.getSession(sessionName);
    if (!session) return false;
    
    try {
      // Try to connect to the browser to verify it's still running
      const browser = await puppeteer.connect({ browserWSEndpoint: session.wsEndpoint });
      await browser.disconnect();
      return true;
    } catch (error) {
      this.logger.debug(`Session ${sessionName} appears inactive: ${error.message}`);
      return false;
    }
  }

}

class SessionDaemon {
  constructor(sessionName, options = {}) {
    this.sessionName = sessionName;
    this.logger = new WebSourceLogger(DEBUG_MODE);
    this.options = options;
    this.browser = null;
    this.lastActivity = Date.now();
    this.timeoutMs = 15 * 60 * 1000; // 15 minutes
    this.checkInterval = 60 * 1000; // Check every minute
    this.monitorTimer = null;
    this.controlServer = null;
    this.controlPort = null;
  }

  async start() {
    this.logger.info(`Starting session daemon: ${this.sessionName}`);
    
    try {
      // Find available port for remote debugging
      const debugPort = 9220 + Math.floor(Math.random() * 100);
      
      // Find available port for control server
      this.controlPort = await this.findAvailablePort(9320);
      
      // Get Chrome executable path
      const executablePath = puppeteer.executablePath();
      
      // Launch Chrome with remote debugging
      const chromeArgs = [
        '--remote-debugging-port=' + debugPort,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ];
      
      if (this.options.headless) {
        chromeArgs.push('--headless=new');
      }
      
      // Spawn Chrome process
      const chromeProcess = spawn(executablePath, chromeArgs, {
        detached: false, // Keep attached to daemon
        stdio: 'ignore'
      });
      
      // Wait for Chrome to start up
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get the proper WebSocket endpoint
      let wsEndpoint;
      try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
        const data = await response.json();
        wsEndpoint = data.webSocketDebuggerUrl;
      } catch (error) {
        throw new Error(`Failed to get Chrome debugging endpoint: ${error.message}`);
      }
      
      // Connect to Chrome
      this.browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
      
      // Start control server for client communication
      await this.startControlServer();
      
      // Start monitoring
      this.startMonitoring();
      
      // Create session file with daemon info
      const sessionManager = new SessionManager(this.logger);
      sessionManager.createSession(this.sessionName, wsEndpoint, process.pid, this.options.headless);
      sessionManager.updateSession(this.sessionName, { 
        controlPort: this.controlPort,
        debugPort: debugPort
      });
      
      this.logger.success(`Session daemon '${this.sessionName}' started successfully`);
      this.logger.info(`Control Port: ${this.controlPort}, Debug Port: ${debugPort}`);
      
      // Handle graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());
      
      return { success: true, controlPort: this.controlPort, debugPort, wsEndpoint };
      
    } catch (error) {
      throw new Error(`Failed to start session daemon '${this.sessionName}': ${error.message}`);
    }
  }

  async findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(startPort, (err) => {
        if (err) {
          // If the specific port is in use, try to find any available port
          server.listen(0, (err) => {
            if (err) reject(err);
            const port = server.address().port;
            server.close(() => resolve(port));
          });
        } else {
          const port = server.address().port;
          server.close(() => resolve(port));
        }
      });
    });
  }

  async startControlServer() {
    return new Promise((resolve, reject) => {
      this.controlServer = createServer((socket) => {
        socket.on('data', (data) => {
          const message = data.toString().trim();
          if (message === 'ping') {
            this.updateActivity();
            socket.write('pong\n');
          } else if (message === 'status') {
            const status = {
              active: true,
              lastActivity: this.lastActivity,
              timeUntilShutdown: Math.max(0, this.timeoutMs - (Date.now() - this.lastActivity))
            };
            socket.write(JSON.stringify(status) + '\n');
          }
        });
      });

      this.controlServer.listen(this.controlPort, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  updateActivity() {
    this.lastActivity = Date.now();
    this.logger.debug(`Activity updated for session: ${this.sessionName}`);
    
    // Update session file
    const sessionManager = new SessionManager(this.logger);
    sessionManager.updateSessionActivity(this.sessionName);
  }

  startMonitoring() {
    this.monitorTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastActivity;
      
      if (idleTime > this.timeoutMs) {
        this.logger.warn(`Session '${this.sessionName}' idle for ${Math.round(idleTime / 1000 / 60)} minutes, shutting down...`);
        this.shutdown();
      } else {
        this.logger.debug(`Session '${this.sessionName}' active, ${Math.round((this.timeoutMs - idleTime) / 1000 / 60)} minutes until timeout`);
      }
    }, this.checkInterval);
  }

  async shutdown() {
    this.logger.info(`Shutting down session daemon: ${this.sessionName}`);
    
    // Clear monitoring timer
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
    
    // Close control server
    if (this.controlServer) {
      this.controlServer.close();
    }
    
    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        this.logger.debug(`Error closing browser: ${error.message}`);
      }
    }
    
    // Delete session file
    const sessionManager = new SessionManager(this.logger);
    sessionManager.deleteSession(this.sessionName);
    
    this.logger.success(`Session daemon '${this.sessionName}' shut down`);
    process.exit(0);
  }
}

class WebSourceBrowser {
  constructor() {
    this.logger = new WebSourceLogger(DEBUG_MODE);
    this.sessionManager = new SessionManager(this.logger);
    this.browser = null;
    this.page = null;
    this.currentUrl = null;
    this.currentSession = null;
  }

  async initialize() {
    // Simple initialization - specific messaging happens during session operations
  }

  async startSession(sessionName = 'default', options = {}) {
    const { headless = true, waitTime = 2000 } = options;
    
    // Check if session already exists
    if (this.sessionManager.sessionExists(sessionName)) {
      const isActive = await this.sessionManager.isSessionActive(sessionName);
      if (isActive) {
        throw new Error(`Session '${sessionName}' already exists and is active`);
      } else {
        // Clean up stale session
        this.sessionManager.deleteSession(sessionName);
        this.logger.warn(`Cleaned up stale session: ${sessionName}`);
      }
    }
    
    this.logger.info(`Starting new session daemon: ${sessionName}`);
    
    try {
      // Spawn daemon as detached background process
      const daemonProcess = spawn(process.argv[0], [process.argv[1]], {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          WEBSOURCE_BROWSER_DAEMON: 'true',
          WEBSOURCE_BROWSER_SESSION_NAME: sessionName,
          WEBSOURCE_BROWSER_HEADLESS: headless.toString()
        }
      });
      
      // Unref so parent can exit
      daemonProcess.unref();
      
      // Wait for daemon to start and create session file
      let attempts = 0;
      const maxAttempts = 60; // Increased to 60 seconds
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (this.sessionManager.sessionExists(sessionName)) {
          const session = this.sessionManager.getSession(sessionName);
          if (session && session.controlPort) {
            this.logger.success(`New session '${sessionName}' created and ready`);
            return { success: true, sessionName, pid: session.pid, controlPort: session.controlPort };
          }
        }
        attempts++;
      }
      
      throw new Error('Daemon failed to start within timeout period');
      
    } catch (error) {
      throw new Error(`Failed to start session daemon '${sessionName}': ${error.message}`);
    }
  }

  async connectToSession(sessionName = 'default') {
    const session = this.sessionManager.getSession(sessionName);
    if (!session) {
      throw new Error(`Session '${sessionName}' does not exist. Use --start to create a session first.`);
    }
    
    this.logger.info(`Connecting to existing session: ${sessionName}`);
    
    // Ping daemon to update activity and verify it's still alive
    await this.pingDaemon(sessionName);
    
    const isActive = await this.sessionManager.isSessionActive(sessionName);
    if (!isActive) {
      this.sessionManager.deleteSession(sessionName);
      throw new Error(`Session '${sessionName}' is no longer active. Use --start to create a new session.`);
    }
    
    try {
      this.browser = await puppeteer.connect({ browserWSEndpoint: session.wsEndpoint });
      const pages = await this.browser.pages();
      this.page = pages[0] || await this.browser.newPage();
      this.currentSession = session;
      
      // Get current URL from the page
      let currentUrl = 'about:blank';
      try {
        currentUrl = await this.page.evaluate(() => window.location.href);
      } catch (error) {
        // If we can't get the URL, use the stored one or fallback
        currentUrl = session.currentUrl || 'about:blank';
      }
      
      this.logger.success(`Connected to session: ${sessionName}`);
      this.logger.info(`Current page: ${currentUrl}`);
      
      return true;
    } catch (error) {
      this.sessionManager.deleteSession(sessionName);
      throw new Error(`Failed to connect to session '${sessionName}': ${error.message}`);
    }
  }

  async pingDaemon(sessionName) {
    const session = this.sessionManager.getSession(sessionName);
    if (!session || !session.controlPort) {
      throw new Error(`Session '${sessionName}' has no control port`);
    }

    return new Promise((resolve, reject) => {
      const socket = createConnection(session.controlPort, 'localhost');
      
      let responded = false;
      const timeout = setTimeout(() => {
        if (!responded) {
          socket.destroy();
          reject(new Error('Daemon ping timeout'));
        }
      }, 5000);
      
      socket.on('connect', () => {
        socket.write('ping\n');
      });
      
      socket.on('data', (data) => {
        if (data.toString().trim() === 'pong') {
          responded = true;
          clearTimeout(timeout);
          socket.end();
          resolve();
        }
      });
      
      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async stopSession(sessionName = 'default') {
    const session = this.sessionManager.getSession(sessionName);
    if (!session) {
      throw new Error(`Session '${sessionName}' does not exist`);
    }
    
    try {
      // Try to connect and close gracefully
      const browser = await puppeteer.connect({ browserWSEndpoint: session.wsEndpoint });
      await browser.close();
      this.logger.success(`Session '${sessionName}' stopped gracefully`);
    } catch (error) {
      this.logger.warn(`Could not gracefully stop session '${sessionName}': ${error.message}`);
    }
    
    // Remove session file
    this.sessionManager.deleteSession(sessionName);
    
    // Clear current session if it's the one being stopped
    if (this.currentSession?.name === sessionName) {
      this.browser = null;
      this.page = null;
      this.currentSession = null;
    }
    
    return { success: true, sessionName };
  }

  async listSessions() {
    const sessions = this.sessionManager.listSessions();
    const activeStatuses = await Promise.all(
      sessions.map(async (session) => ({
        ...session,
        active: await this.sessionManager.isSessionActive(session.name)
      }))
    );
    
    return activeStatuses;
  }

  async navigate(url, sessionName = 'default', options = {}) {
    const { waitTime = 2000 } = options;
    
    // Require active session
    if (!this.currentSession || this.currentSession.name !== sessionName) {
      await this.connectToSession(sessionName);
    }
    
    if (!this.page) {
      throw new Error('No active page. Session may have been corrupted.');
    }
    
    this.logger.info(`Navigating to: ${url}`);
    
    try {
      // Navigate to the URL
      await this.page.goto(url, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      // Wait for specified time for page to settle
      if (waitTime > 0) {
        this.logger.debug(`Waiting ${waitTime}ms for page to settle...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Get page information and selector analysis
      const pageData = await this.page.evaluate(() => {
        // Get basic page info
        const pageInfo = {
          url: window.location.href,
          title: document.title,
          ready: document.readyState === 'complete'
        };
        
        // Analyze selectors
        const allElements = Array.from(document.querySelectorAll('*'));
        const tagCounts = {};
        const idSelectors = [];
        const classSelectors = [];
        
        allElements.forEach(el => {
          // Count tag types
          const tag = el.tagName.toLowerCase();
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          
          // Collect IDs
          if (el.id) {
            idSelectors.push(`#${el.id}`);
          }
          
          // Collect classes
          if (el.className && typeof el.className === 'string') {
            el.className.split(' ').forEach(cls => {
              if (cls.trim()) {
                const selector = `.${cls.trim()}`;
                if (!classSelectors.includes(selector)) {
                  classSelectors.push(selector);
                }
              }
            });
          }
        });
        
        const selectors = {
          totalElements: allElements.length,
          commonSelectors: [
            'body', 'main', 'header', 'footer', 'nav', 'section', 'article',
            'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'a', 'img', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
            'form', 'input', 'button', 'textarea', 'select'
          ].filter(tag => tagCounts[tag]),
          idSelectors: idSelectors.sort(),
          classSelectors: classSelectors.sort()
        };
        
        return { pageInfo, selectors };
      });
      
      // Update session with current URL
      this.sessionManager.updateSession(sessionName, { currentUrl: pageData.pageInfo.url });
      this.currentUrl = pageData.pageInfo.url;
      
      this.logger.success(`Successfully navigated to: ${pageData.pageInfo.title}`);
      this.logger.debug(`Final URL: ${pageData.pageInfo.url}`);
      
      return { 
        success: true, 
        pageInfo: pageData.pageInfo, 
        selectors: pageData.selectors 
      };
      
    } catch (error) {
      throw new Error(`Failed to navigate to ${url}: ${error.message}`);
    }
  }

  async refreshPage(sessionName = 'default', options = {}) {
    const { waitTime = 2000 } = options;
    
    this.logger.info('Refreshing current page...');
    
    // Require active session
    if (!this.currentSession || this.currentSession.name !== sessionName) {
      await this.connectToSession(sessionName);
    }
    
    if (!this.page) {
      throw new Error('No active session. Use --start to create a session first.');
    }
    
    try {
      // Refresh the page with more robust options
      await this.page.reload({ waitUntil: 'networkidle0', timeout: 15000 });
      
      // Wait for specified time for page to settle
      if (waitTime > 0) {
        this.logger.debug(`Waiting ${waitTime}ms for page to settle after refresh...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Get page information
      const pageInfo = await this.page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          ready: document.readyState === 'complete'
        };
      });
      
      // Update session with current URL (in case it changed)
      this.sessionManager.updateSession(sessionName, { currentUrl: pageInfo.url });
      this.currentUrl = pageInfo.url;
      
      this.logger.success(`Page refreshed successfully: ${pageInfo.title}`);
      this.logger.debug(`Current URL: ${pageInfo.url}`);
      
      return { success: true, pageInfo };
      
    } catch (error) {
      // If networkidle0 fails, try a simpler approach
      try {
        this.logger.warn(`Standard reload failed, trying simple reload: ${error.message}`);
        await this.page.reload({ timeout: 10000 });
        
        // Wait for page to settle
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Get page information
        const pageInfo = await this.page.evaluate(() => {
          return {
            url: window.location.href,
            title: document.title,
            ready: document.readyState === 'complete'
          };
        });
        
        // Update session with current URL
        this.sessionManager.updateSession(sessionName, { currentUrl: pageInfo.url });
        this.currentUrl = pageInfo.url;
        
        this.logger.success(`Page refreshed successfully (simple reload): ${pageInfo.title}`);
        return { success: true, pageInfo };
        
      } catch (fallbackError) {
        throw new Error(`Failed to refresh page: ${fallbackError.message}`);
      }
    }
  }

  async analyzeSelectors(selector = null, sessionName = 'default') {
    this.logger.debug(`Analyzing selectors: ${selector || 'top level'}`);
    
    // Require active session
    if (!this.currentSession || this.currentSession.name !== sessionName) {
      await this.connectToSession(sessionName);
    }
    
    if (!this.page) {
      throw new Error('No active session. Use --start to create a session first.');
    }
    
    try {
      if (!selector) {
        // Return top-level page structure analysis
        const pageAnalysis = await this.page.evaluate(() => {
          const allElements = Array.from(document.querySelectorAll('*'));
          const tagCounts = {};
          const idSelectors = [];
          const classSelectors = [];
          
          allElements.forEach(el => {
            // Count tag types
            const tag = el.tagName.toLowerCase();
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            
            // Collect IDs
            if (el.id) {
              idSelectors.push(`#${el.id}`);
            }
            
            // Collect classes
            if (el.className && typeof el.className === 'string') {
              el.className.split(' ').forEach(cls => {
                if (cls.trim()) {
                  const selector = `.${cls.trim()}`;
                  if (!classSelectors.includes(selector)) {
                    classSelectors.push(selector);
                  }
                }
              });
            }
          });
          
          return {
            totalElements: allElements.length,
            tagTypes: Object.keys(tagCounts).sort(),
            tagCounts: tagCounts,
            idSelectors: idSelectors,
            classSelectors: classSelectors.sort(),
            commonSelectors: [
              'body', 'main', 'header', 'footer', 'nav', 'section', 'article',
              'div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
              'a', 'img', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
              'form', 'input', 'button', 'textarea', 'select'
            ].filter(tag => tagCounts[tag])
          };
        });
        return { success: true, analysis: pageAnalysis };
        
      } else {
        // Analyze elements within the given selector
        const selectorAnalysis = await this.page.evaluate((sel) => {
          const parentElement = document.querySelector(sel);
          if (!parentElement) {
            return { found: false };
          }
          
          const children = Array.from(parentElement.children);
          const descendants = Array.from(parentElement.querySelectorAll('*'));
          
          const childSelectors = children.map((child, index) => {
            const tagName = child.tagName.toLowerCase();
            const id = child.id ? `#${child.id}` : null;
            const classes = child.className && typeof child.className === 'string' 
              ? child.className.split(' ').filter(c => c.trim()).map(c => `.${c}`) 
              : [];
            
            return {
              index: index,
              tagName: tagName,
              selector: `${sel} > ${tagName}:nth-child(${index + 1})`,
              id: id,
              classes: classes,
              textContent: child.textContent,
              hasChildren: child.children.length > 0,
              childCount: child.children.length
            };
          });
          
          return {
            found: true,
            parentSelector: sel,
            parentTag: parentElement.tagName.toLowerCase(),
            directChildren: children.length,
            totalDescendants: descendants.length,
            childSelectors: childSelectors
          };
        }, selector);
        
        if (!selectorAnalysis.found) {
          return { success: false, error: `Element not found: ${selector}` };
        }
        
        return { success: true, analysis: selectorAnalysis };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Safe JSON serialization for complex objects with circular references
  safeStringify(value, replacer = null, space = null) {
    try {
      const seen = new WeakSet();

      const circularReplacer = (key, val) => {
        // Apply custom replacer first if provided
        if (replacer && typeof replacer === 'function') {
          val = replacer(key, val);
        }

        // Handle circular references
        if (val !== null && typeof val === 'object') {
          if (seen.has(val)) {
            return '[Circular Reference]';
          }
          seen.add(val);
        }

        // Handle special objects that can cause issues
        if (val && typeof val === 'object' && val.constructor) {
          const constructorName = val.constructor.name;

          // Handle common problematic object types
          if (constructorName.includes('Element') || constructorName.includes('Node')) {
            return {
              type: constructorName,
              id: val.id || null,
              className: val.className || null,
              tagName: val.tagName || null,
              _sanitized: 'DOM element sanitized',
            };
          }
        }

        return val;
      };

      return JSON.stringify(value, circularReplacer, space);
    } catch (error) {
      this.logger.warn('Safe JSON serialization failed:', error);
      return `[Serialization Error: ${error.message}]`;
    }
  }

  async executeJavaScript(code, sessionName = 'default') {
    this.logger.debug(`Executing JavaScript: ${code}`);
    
    // Require active session
    if (!this.currentSession || this.currentSession.name !== sessionName) {
      await this.connectToSession(sessionName);
    }
    
    if (!this.page) {
      throw new Error('No active session. Use --start to create a session first.');
    }
    
    try {
      // Execute the code and get the result
      const result = await this.page.evaluate((codeToExecute) => {
        try {
          // Use indirect eval to execute in global scope
          const globalEval = window.eval;
          const rawResult = globalEval(codeToExecute);
          
          // Try to create a safe representation of the result
          const safeResult = (() => {
            if (rawResult === null || rawResult === undefined) {
              return rawResult;
            }
            
            if (typeof rawResult === 'function') {
              return {
                _type: 'function',
                name: rawResult.name || 'anonymous',
                length: rawResult.length,
                toString: rawResult.toString()
              };
            }
            
            if (typeof rawResult === 'object') {
              // Handle arrays
              if (Array.isArray(rawResult)) {
                return rawResult; // Return full array
              }
              
              // For objects, try to serialize safely
              try {
                JSON.stringify(rawResult);
                return rawResult; // If it can be stringified, return as-is
              } catch (e) {
                // If circular or problematic, create safe representation
                if (rawResult.constructor) {
                  return {
                    _type: 'object',
                    constructor: rawResult.constructor.name,
                    keys: Object.keys(rawResult),
                    _note: 'Complex object - use specific properties to inspect'
                  };
                }
                return '[Complex Object - Cannot Serialize]';
              }
            }
            
            return rawResult;
          })();
          
          return { success: true, result: safeResult };
        } catch (executionError) {
          return { success: false, error: executionError.message, stack: executionError.stack };
        }
      }, code);

      if (result.success) {
        return { success: true, result: result.result };
      } else {
        return { 
          success: false, 
          error: result.error,
          stack: result.stack
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async takeScreenshot(filename = null, sessionName = 'default') {
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `websource-browser-screenshot-${timestamp}.png`;
    }
    
    this.logger.debug(`Taking screenshot: ${filename}`);
    
    // Require active session
    if (!this.currentSession || this.currentSession.name !== sessionName) {
      await this.connectToSession(sessionName);
    }
    
    if (!this.page) {
      throw new Error('No active session. Use --start to create a session first.');
    }
    
    try {
      const screenshotPath = resolve(filename);
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      this.logger.success(`Screenshot saved: ${screenshotPath}`);
      return { success: true, path: screenshotPath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async viewElement(selector = null, sessionName = 'default') {
    this.logger.debug(`Viewing element: ${selector || 'entire page'}`);
    
    // Require active session
    if (!this.currentSession || this.currentSession.name !== sessionName) {
      await this.connectToSession(sessionName);
    }
    
    if (!this.page) {
      throw new Error('No active session. Use --start to create a session first.');
    }
    
    try {
      if (!selector) {
        // Return full page content
        const pageContent = await this.page.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            html: document.documentElement.outerHTML,
            text: document.body.innerText
          };
        });
        return { success: true, page: pageContent };
      } else {
        // Return element-specific information
        const elementInfo = await this.page.evaluate((sel) => {
          const element = document.querySelector(sel);
          if (!element) {
            return { found: false };
          }
          
          const computed = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          
          return {
            found: true,
            tagName: element.tagName,
            id: element.id,
            className: element.className,
            textContent: element.textContent,
            attributes: Array.from(element.attributes).reduce((attrs, attr) => {
              attrs[attr.name] = attr.value;
              return attrs;
            }, {}),
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height
            },
            computed: {
              display: computed.display,
              position: computed.position,
              visibility: computed.visibility,
              opacity: computed.opacity,
              zIndex: computed.zIndex,
              backgroundColor: computed.backgroundColor,
              color: computed.color,
              fontSize: computed.fontSize,
              fontFamily: computed.fontFamily
            },
            isVisible: rect.width > 0 && rect.height > 0 && computed.visibility !== 'hidden' && computed.display !== 'none'
          };
        }, selector);
        
        if (!elementInfo.found) {
          return { success: false, error: `Element not found: ${selector}` };
        }
        
        return { success: true, element: elementInfo };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  formatOutput(data, format = 'json', outputFile = null) {
    let output;
    
    switch (format) {
      case 'pretty':
        output = this.safeStringify(data, null, 2);
        break;
      case 'json':
      default:
        output = this.safeStringify(data);
        break;
    }
    
    if (outputFile) {
      const resolvedPath = resolve(outputFile);
      writeFileSync(resolvedPath, output);
      this.logger.success(`Output saved to: ${resolvedPath}`);
    } else {
      console.log(output);
    }
    
    return output;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    this.currentUrl = null;
  }
}

export { WebSourceBrowser };