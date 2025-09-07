/**
 * @file mcp-server.js
 * @description MCP server implementation for WebSource Browser
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
// WebSourceBrowser is imported dynamically in the constructor to avoid circular dependencies

/**
 * WebSourceBrowserMcpServer class
 * Implements an MCP server that exposes WebSource Browser functionality
 */
class WebSourceBrowserMcpServer {
  constructor() {
    // Create the MCP server
    this.mcpServer = new McpServer({
      name: "websource-browser",
      version: "0.1.1"
    });
    
    // WebSourceBrowser instance will be created when needed
    this.webSourceBrowser = null;
    
    // Map to keep track of active sessions
    this.activeSessions = new Map();
    
    // Register all tools
    this.registerTools();
  }

  /**
   * Register all MCP tools that expose WebSource Browser functionality
   */
  async initializeWebSourceBrowser() {
    if (!this.webSourceBrowser) {
      const { WebSourceBrowser } = await import('./websource-browser-module.js');
      this.webSourceBrowser = new WebSourceBrowser();
      await this.webSourceBrowser.initialize();
    }
  }

  registerTools() {
    // Session Management Tools
    this.mcpServer.registerTool("startSession", {
      title: "Start Browser Session",
      description: "Start a new persistent browser session",
      inputSchema: {
        sessionName: z.string().optional().describe("Name of the session (default: 'default')"),
        headless: z.boolean().optional().describe("Run in headless mode (default: true)")
      }
    }, async (args) => {
      try {
        await this.initializeWebSourceBrowser();
        const sessionName = args.sessionName || 'default';
        const headless = args.headless !== undefined ? args.headless : true;
        
        const result = await this.webSourceBrowser.startSession(sessionName, { headless });
        this.activeSessions.set(sessionName, { headless });
        
        return {
          content: [{
            type: "text",
            text: `Session '${sessionName}' started successfully. PID: ${result.pid}, Control Port: ${result.controlPort}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error starting session: ${error.message}`
          }],
          isError: true
        };
      }
    });

    this.mcpServer.registerTool("stopSession", {
      title: "Stop Browser Session",
      description: "Stop an existing browser session",
      inputSchema: {
        sessionName: z.string().optional().describe("Name of the session (default: 'default')")
      }
    }, async (args) => {
      try {
        await this.initializeWebSourceBrowser();
        const sessionName = args.sessionName || 'default';
        
        const result = await this.webSourceBrowser.stopSession(sessionName);
        this.activeSessions.delete(sessionName);
        
        return {
          content: [{
            type: "text",
            text: `Session '${sessionName}' stopped successfully`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error stopping session: ${error.message}`
          }],
          isError: true
        };
      }
    });

    this.mcpServer.registerTool("listSessions", {
      title: "List Browser Sessions",
      description: "List all active browser sessions"
    }, async () => {
      try {
        await this.initializeWebSourceBrowser();
        const sessions = await this.webSourceBrowser.listSessions();
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(sessions, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing sessions: ${error.message}`
          }],
          isError: true
        };
      }
    });

    // Navigation Tools
    this.mcpServer.registerTool("navigate", {
      title: "Navigate to URL",
      description: "Navigate to a URL in a browser session",
      inputSchema: {
        url: z.string().describe("URL to navigate to"),
        sessionName: z.string().optional().describe("Name of the session (default: 'default')"),
        waitTime: z.number().optional().describe("Wait time after navigation in milliseconds (default: 2000)")
      }
    }, async (args) => {
      try {
        await this.initializeWebSourceBrowser();
        const { url, sessionName = 'default', waitTime = 2000 } = args;
        
        const result = await this.webSourceBrowser.navigate(url, sessionName, { waitTime });
        
        return {
          content: [{
            type: "text",
            text: `Successfully navigated to: ${result.pageInfo.title}
URL: ${result.pageInfo.url}
Ready: ${result.pageInfo.ready}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error navigating to URL: ${error.message}`
          }],
          isError: true
        };
      }
    });

    this.mcpServer.registerTool("refresh", {
      title: "Refresh Page",
      description: "Refresh/reload the current page in a browser session",
      inputSchema: {
        sessionName: z.string().optional().describe("Name of the session (default: 'default')"),
        waitTime: z.number().optional().describe("Wait time after refresh in milliseconds (default: 2000)")
      }
    }, async (args) => {
      try {
        await this.initializeWebSourceBrowser();
        const { sessionName = 'default', waitTime = 2000 } = args;
        
        const result = await this.webSourceBrowser.refreshPage(sessionName, { waitTime });
        
        return {
          content: [{
            type: "text",
            text: `Page refreshed successfully: ${result.pageInfo.title}
URL: ${result.pageInfo.url}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error refreshing page: ${error.message}`
          }],
          isError: true
        };
      }
    });

    // Execution Tools
    this.mcpServer.registerTool("executeJavaScript", {
      title: "Execute JavaScript",
      description: "Execute JavaScript code in a browser session and return results",
      inputSchema: {
        code: z.string().describe("JavaScript code to execute"),
        sessionName: z.string().optional().describe("Name of the session (default: 'default')")
      }
    }, async (args) => {
      try {
        await this.initializeWebSourceBrowser();
        const { code, sessionName = 'default' } = args;
        
        const result = await this.webSourceBrowser.executeJavaScript(code, sessionName);
        
        if (result.success) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result.result, null, 2)
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `JavaScript execution error: ${result.error}`
            }],
            isError: true
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error executing JavaScript: ${error.message}`
          }],
          isError: true
        };
      }
    });

    // Inspection Tools
    this.mcpServer.registerTool("viewElement", {
      title: "View Element",
      description: "View page or element information",
      inputSchema: {
        selector: z.string().optional().describe("CSS selector of element to view (if not provided, views entire page)"),
        sessionName: z.string().optional().describe("Name of the session (default: 'default')")
      }
    }, async (args) => {
      try {
        await this.initializeWebSourceBrowser();
        const { selector, sessionName = 'default' } = args;
        
        const result = await this.webSourceBrowser.viewElement(selector || null, sessionName);
        
        if (result.success) {
          if (result.page) {
            return {
              content: [{
                type: "text",
                text: `Page Title: ${result.page.title}
URL: ${result.page.url}
Text Preview: ${result.page.text.substring(0, 200)}...`
              }]
            };
          } else if (result.element) {
            return {
              content: [{
                type: "text",
                text: `Element: ${result.element.tagName}
ID: ${result.element.id}
Classes: ${result.element.className}
Text: ${result.element.textContent.substring(0, 100)}...
Visible: ${result.element.isVisible}`
              }]
            };
          }
        } else {
          return {
            content: [{
              type: "text",
              text: `Error viewing element: ${result.error}`
            }],
            isError: true
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error viewing element: ${error.message}`
          }],
          isError: true
        };
      }
    });

    this.mcpServer.registerTool("analyzeSelectors", {
      title: "Analyze Selectors",
      description: "Analyze page selectors or selectors within an element",
      inputSchema: {
        selector: z.string().optional().describe("CSS selector to analyze within (if not provided, analyzes entire page)"),
        sessionName: z.string().optional().describe("Name of the session (default: 'default')")
      }
    }, async (args) => {
      try {
        await this.initializeWebSourceBrowser();
        const { selector, sessionName = 'default' } = args;
        
        const result = await this.webSourceBrowser.analyzeSelectors(selector || null, sessionName);
        
        if (result.success) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify(result.analysis, null, 2)
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `Error analyzing selectors: ${result.error}`
            }],
            isError: true
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error analyzing selectors: ${error.message}`
          }],
          isError: true
        };
      }
    });

    this.mcpServer.registerTool("takeScreenshot", {
      title: "Take Screenshot",
      description: "Take a screenshot of the current page",
      inputSchema: {
        filename: z.string().optional().describe("Filename for screenshot (if not provided, auto-generated)"),
        sessionName: z.string().optional().describe("Name of the session (default: 'default')")
      }
    }, async (args) => {
      try {
        await this.initializeWebSourceBrowser();
        const { filename, sessionName = 'default' } = args;
        
        const result = await this.webSourceBrowser.takeScreenshot(filename || null, sessionName);
        
        if (result.success) {
          return {
            content: [{
              type: "text",
              text: `Screenshot saved to: ${result.path}`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `Error taking screenshot: ${result.error}`
            }],
            isError: true
          };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error taking screenshot: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start() {
    try {
      const transport = new StdioServerTransport();
      await this.mcpServer.connect(transport);
      console.error("[WebSource Browser MCP] Server started and ready to accept connections");
    } catch (error) {
      console.error("[WebSource Browser MCP] Error starting server:", error);
      process.exit(1);
    }
  }

  /**
   * Stop the MCP server
   */
  async stop() {
    try {
      await this.mcpServer.close();
      console.error("[WebSource Browser MCP] Server stopped");
    } catch (error) {
      console.error("[WebSource Browser MCP] Error stopping server:", error);
    }
  }
}

export default WebSourceBrowserMcpServer;