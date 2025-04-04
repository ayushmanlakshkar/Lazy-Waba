"use client";

import React, { useState, useRef, useEffect } from "react";
import { pipe } from "@screenpipe/browser";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare, CheckCircle, AlertCircle, Minimize, Maximize, Settings } from "lucide-react";
import { LastOcrImage } from "./last-ocr-image";
import { useOllama } from "@/hooks/use-ollama";
import { useNebius } from "@/hooks/use-nebius";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// App coordinates configuration
const APP_CONFIGS = {
  whatsapp: {
    inputBox: { x: 650, y: 680 },
    sendButton: { x: 720, y: 680 },
  },
  discord: {
    inputBox: { x: 600, y: 700 },
    sendButton: { x: 670, y: 700 },
  },
};

// Chat Message interface
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

const ChatAutomation: React.FC = () => {
  const [selectedApp, setSelectedApp] = useState<"whatsapp" | "discord">("whatsapp");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [lastMessage, setLastMessage] = useState("");
  const [lastOcrText, setLastOcrText] = useState("");
  const [logs, setLogs] = useState<{ time: string; message: string }[]>([]);
  const messageHistory = useRef<string[]>([]);
  const monitoringTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  // Health status state
  const [healthStatus, setHealthStatus] = useState<"healthy" | "error" | "loading">("loading");
  const healthCheckTimerRef = useRef<NodeJS.Timeout | null>(null);

  // AI provider and minimization settings
  const [aiProvider, setAiProvider] = useLocalStorage<"ollama" | "nebius">("aiProvider", "ollama");
  const [nebiusApiKey, setNebiusApiKey] = useLocalStorage<string>("nebiusApiKey", "");
  const [ollamaModel, setOllamaModel] = useLocalStorage<string>("ollamaModel", "qwen2.5");
  const [nebiusModel, setNebiusModel] = useLocalStorage<string>("nebiusModel", "meta-llama/Meta-Llama-3.1-70B-Instruct");
  const [isMinimized, setIsMinimized] = useLocalStorage<boolean>("chatAutoMinimized", false);
  const [isConfiguring, setIsConfiguring] = useLocalStorage<boolean>("isConfiguring", true);

  // Initialize AI hooks
  const ollama = useOllama({ model: ollamaModel });
  const nebius = useNebius({ 
    model: nebiusModel, 
    apiKey: nebiusApiKey 
  });

  // Load models when API key is set
  useEffect(() => {
    if (nebiusApiKey && aiProvider === "nebius") {
      nebius.fetchAvailableModels();
    }
  }, [nebiusApiKey, aiProvider]);

  useEffect(() => {
    if (aiProvider === "ollama") {
      ollama.fetchAvailableModels();
    }
  }, [aiProvider]);

  const addLog = (message: string) => {
    const timeString = new Date().toLocaleTimeString();
    console.log(`[${timeString}] ${message}`);
    setLogs((prevLogs) => {
      const newLogs = [...prevLogs, { time: timeString, message }];
      return newLogs.slice(-10); // Keep only last 10 logs
    });
  };

  const toggleMonitoring = () => {
    console.log("toggleMonitoring called, current state:", isMonitoring);
    if (isMonitoring) {
      stopMonitoring();
    } else {
      startMonitoring();
    }
  };

  const startMonitoring =async() => {
    console.log("startMonitoring called for app:", selectedApp);
    addLog(`Starting monitoring for ${selectedApp} in 10 seconds...`);
    setIsMonitoring(true);

    // Wait 10 seconds before starting monitoring
    console.log("Setting timeout for 10 seconds before monitoring begins");
    await pipe.operator.openApplication("Whatsapp")
    monitoringTimerRef.current = setTimeout(async() => {
      console.log("10-second timeout completed, starting actual monitoring");
      addLog("Now beginning chat monitoring");
      monitorChat();
    }, 1000);
  };

  const stopMonitoring = () => {
    console.log("stopMonitoring called");
    setIsMonitoring(false);
    if (monitoringTimerRef.current) {
      console.log("Clearing monitoring timeout/interval");
      clearTimeout(monitoringTimerRef.current);
    }
    addLog(`Stopped monitoring ${selectedApp}`);
  };

  const detectNewMessages = (text: string) => {
    console.log("detectNewMessages called with text length:", text?.length);
    if (!text || text === lastOcrText) {
      console.log("Text unchanged or empty, skipping detection");
      return;
    }

    setLastOcrText(text);

    // Extract the last paragraph as the message
    const messageBlocks = text.split(/\n{2,}/);
    console.log("Split message blocks, count:", messageBlocks.length);
    const lastBlock = messageBlocks[messageBlocks.length - 1].trim();

    console.log("Last message block:", lastBlock);
    console.log("Is new message?", lastBlock !== lastMessage);
    console.log("Already in history?", messageHistory.current.includes(lastBlock));

    if (lastBlock && lastBlock !== lastMessage && !messageHistory.current.includes(lastBlock)) {
      console.log("New message detected, processing response");
      setLastMessage(lastBlock);
      messageHistory.current.push(lastBlock);
      
      // Add to chat history
      const newMessage: ChatMessage = {
        role: 'user',
        content: lastBlock,
        timestamp: Date.now()
      };
      
      setChatHistory(prev => [...prev, newMessage]);
      addLog(`New message: "${lastBlock.substring(0, 30)}${lastBlock.length > 30 ? "..." : ""}"`);
      generateAndSendResponse(lastBlock);
    } else {
      console.log("Message ignored - either empty, duplicate, or already processed");
    }
  };

  const generateAndSendResponse = async (message: string) => {
    console.log("generateAndSendResponse called for message:", message);
    try {
      addLog("Processing message for response");

      // Create OCR context
      const ocrContext = {
        text: lastOcrText,
        confidence: 0.9
      };

      // Generate response with AI
      let response = "";
      if (aiProvider === "ollama") {
        if (ollama.isProcessing) {
          response = "I'm still thinking about your last message. I'll respond in a moment.";
        } else {
          addLog("Generating response with Ollama");
          response = await ollama.generateChatResponse(message, chatHistory, ocrContext);
        }
      } else {
        if (nebius.isProcessing || !nebiusApiKey) {
          response = "Let me think about this for a moment.";
        } else {
          addLog("Generating response with Nebius");
          response = await nebius.generateChatResponse(message, chatHistory, ocrContext);
        }
      }

      addLog(`Response: "${response.substring(0, 30)}${response.length > 30 ? "..." : ""}"`);

      // Add response to chat history
      const newMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      };
      
      setChatHistory(prev => [...prev, newMessage]);

      // Send the response if still monitoring
      if (isMonitoring) {
        console.log("Still monitoring, sending response");
        await sendResponse(response);
        messageHistory.current.push(`AI: ${response}`);
      } else {
        console.log("Monitoring stopped, not sending response");
      }
    } catch (err) {
      console.error("Error in generateAndSendResponse:", err);
      addLog(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const sendResponse = async (text: string) => {
    console.log("sendResponse called with text:", text);
    try {
      const config = APP_CONFIGS[selectedApp];
      addLog(`Sending response to ${selectedApp}`);

      // Move to input box and click
      console.log("Moving mouse to input box:", config.inputBox);
      await pipe.operator.pixel.moveMouse(config.inputBox.x, config.inputBox.y);
      await new Promise((resolve) => setTimeout(resolve, 300));
      console.log("Clicking input box");
      await pipe.operator.pixel.click("left");

      // Triple click to select all text
      console.log("Triple-clicking to select all text");
      await new Promise((resolve) => setTimeout(resolve, 300));
      for (let i = 0; i < 3; i++) {
        await pipe.operator.pixel.click("left");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Type response
      console.log("Starting to type response");
      addLog("Typing response");
      const chunks = text.match(/.{1,15}|.+/g) || [];
      for (const chunk of chunks) {
        console.log("Typing chunk:", chunk);
        await pipe.operator.pixel.type(chunk);
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // Click send button
      console.log("Moving mouse to send button:", config.sendButton);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await pipe.operator.pixel.moveMouse(config.sendButton.x, config.sendButton.y);
      await new Promise((resolve) => setTimeout(resolve, 300));
      console.log("Clicking send button");
      await pipe.operator.pixel.click("left");

      console.log("Response sent successfully");
      addLog("Response sent successfully");
    } catch (err) {
      console.error("Error in sendResponse:", err);
      addLog(`Error sending: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  const monitorChat = async () => {
    console.log("monitorChat called, isMonitoring:", isMonitoring);
    if (!isMonitoring) {
      console.log("Monitoring is off, exiting monitorChat");
      return;
    }

    console.log("Getting OCR data...");
    addLog("Getting OCR data...");

    try {
      // Get OCR data
      console.log("Calling pipe.queryScreenpipe for OCR data");
      const result = await pipe.queryScreenpipe({
        contentType: "ocr",
        limit: 1,
      });
      console.log("OCR API response received:", result);

      if (result?.data?.length > 0) {
        console.log("OCR data found, items:", result.data.length);
        const text = result.data[0].content?.text;
        if (text) {
          console.log("OCR text found, length:", text.length);
          addLog(`OCR text captured (${text.length} chars)`);
          detectNewMessages(text);
        } else {
          console.log("No text content in OCR data");
          addLog("No text content in OCR data");
        }
      } else {
        console.log("No OCR data available in response");
        addLog("No OCR data available");
      }
    } catch (err) {
      console.error("Error in OCR processing:", err);
      addLog(`OCR error: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
   
    await pipe.operator.pixel.moveMouse(720, 800)
    await pipe.operator.pixel.click("left")
    await pipe.operator.pixel.type("hello world")
    await pipe.operator.pixel.press("enter")
    await pipe.operator.pixel.press("enter")
    console.log("Setting up next monitoring cycle in 5 seconds");
    monitoringTimerRef.current = setTimeout(() => {
      console.log("5-second timeout completed, checking if monitoring should continue");
      if (isMonitoring) {
        console.log("Monitoring is still on, continuing to next cycle");
        monitorChat();
      } else {
        console.log("Monitoring was turned off during wait, stopping cycle");
      }
    }, 5000);
  };

  const checkHealthStatus = async () => {
    console.log("Checking health status");
    try {
      const response = await fetch("http://localhost:3030/health");
      console.log("Health check response:", response.status);
      if (response.ok) {
        console.log("Health status: healthy");
        setHealthStatus("healthy");
      } else {
        console.log("Health status: error (response not ok)");
        setHealthStatus("error");
      }
    } catch (err) {
      console.error("Health check error:", err);
      setHealthStatus("error");
    }
  };

  // Clean up intervals on unmount
  useEffect(() => {
    console.log("Setting up health check timer");
    // Check immediately on load
    checkHealthStatus();

    // Set up periodic checking every 30 seconds
    healthCheckTimerRef.current = setInterval(() => {
      console.log("Running scheduled health check");
      checkHealthStatus();
    }, 30000);

    // Cleanup on unmount
    return () => {
      console.log("Cleaning up health check timer");
      if (healthCheckTimerRef.current) {
        clearInterval(healthCheckTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    console.log("Component mounted, setting up cleanup for monitoring timer");
    return () => {
      console.log("Component unmounting, cleaning up monitoring timer");
      if (monitoringTimerRef.current) {
        clearTimeout(monitoringTimerRef.current);
      }
    };
  }, []);

  // Render minimized UI
  if (isMinimized && !isConfiguring) {
    return (
      <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 shadow-lg rounded-md p-3 z-50 border border-gray-200 dark:border-gray-700 flex items-center space-x-2">
        <MessageSquare className="h-5 w-5 text-blue-500" />
        <div className="flex-1">
          <div className="text-sm font-medium">Chat Automation</div>
          <div className="text-xs text-gray-500">
            {isMonitoring ? 'Active - ' + selectedApp : 'Inactive'}
          </div>
        </div>
        {isMonitoring && (
          <div className="animate-pulse">
            <div className="h-2 w-2 bg-green-500 rounded-full"></div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={() => setIsMinimized(false)}>
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded-lg shadow-md space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Chat Automation
        </h2>

        <div className="flex items-center gap-2">
          {!isConfiguring && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsMinimized(true)}
              title="Minimize"
            >
              <Minimize className="h-4 w-4" />
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsConfiguring(!isConfiguring)}
            title={isConfiguring ? "Done configuring" : "Configure"}
          >
            <Settings className="h-4 w-4" />
          </Button>
          <div
            className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer"
            onClick={checkHealthStatus}
            title={
              healthStatus === "healthy"
                ? "Backend connection is healthy"
                : healthStatus === "error"
                ? "Connection issue with backend"
                : "Checking connection..."
            }
          >
            {healthStatus === "loading" ? (
              <Loader2 className="h-4 w-4 text-gray-500 animate-spin" />
            ) : healthStatus === "healthy" ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-500" />
            )}
          </div>
        </div>
      </div>

      {isConfiguring && (
        <div className="space-y-4 border-b pb-4">
          <div>
            <h3 className="text-sm font-semibold mb-2">AI Provider</h3>
            <div className="flex gap-2">
              <Button
                variant={aiProvider === "ollama" ? "default" : "outline"}
                onClick={() => setAiProvider("ollama")}
                size="sm"
              >
                Ollama
              </Button>
              <Button
                variant={aiProvider === "nebius" ? "default" : "outline"}
                onClick={() => setAiProvider("nebius")}
                size="sm"
              >
                Nebius
              </Button>
            </div>
          </div>

          {aiProvider === "nebius" && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Nebius API Key</h3>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={nebiusApiKey}
                  onChange={(e) => setNebiusApiKey(e.target.value)}
                  placeholder="Enter API Key"
                  className="flex-1"
                />
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold mb-2">Select Model</h3>
            {aiProvider === "ollama" ? (
              <Select value={ollamaModel} onValueChange={setOllamaModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {ollama.isLoadingModels ? (
                    <div className="p-2 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      <p className="text-xs mt-1">Loading models...</p>
                    </div>
                  ) : ollama.availableModels.length > 0 ? (
                    ollama.availableModels.map((model) => (
                      <SelectItem key={model.name} value={model.name}>
                        {model.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-center text-xs">
                      No models found. Make sure Ollama is running.
                    </div>
                  )}
                </SelectContent>
              </Select>
            ) : (
              <Select value={nebiusModel} onValueChange={setNebiusModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Model" />
                </SelectTrigger>
                <SelectContent>
                  {nebius.isLoadingModels ? (
                    <div className="p-2 text-center">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      <p className="text-xs mt-1">Loading models...</p>
                    </div>
                  ) : nebius.availableModels.length > 0 ? (
                    nebius.availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-center text-xs">
                      {nebiusApiKey ? "No models found" : "Enter API Key to load models"}
                    </div>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button 
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => setIsConfiguring(false)}
          >
            Save Configuration
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">1. Select Application</h3>
          <div className="flex gap-2">
            <Button
              variant={selectedApp === "whatsapp" ? "default" : "outline"}
              onClick={() => setSelectedApp("whatsapp")}
              size="sm"
            >
              WhatsApp
            </Button>
            <Button
              variant={selectedApp === "discord" ? "default" : "outline"}
              onClick={() => setSelectedApp("discord")}
              size="sm"
            >
              Discord
            </Button>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-2">2. Start Monitoring</h3>
          <Button
            onClick={toggleMonitoring}
            variant={isMonitoring ? "destructive" : "default"}
            className="w-full"
          >
            {isMonitoring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Stop Monitoring
              </>
            ) : (
              "Start Monitoring"
            )}
          </Button>
          <div className="text-xs text-gray-500 mt-1">
            You'll have 10 seconds to switch to your chat application
          </div>
        </div>

        {lastMessage && (
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">Last Detected Message</h3>
            <div className="text-xs p-2 bg-gray-50 rounded max-h-20 overflow-y-auto">
              {lastMessage}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Workflow Logs</h3>
          <div className="text-xs p-2 bg-gray-50 rounded max-h-40 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-400 italic">No logs yet</p>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="mb-1">
                  <span className="text-gray-500">[{log.time}]</span>{" "}
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="text-xs border-t pt-2 text-gray-500">
          <h3 className="font-semibold text-gray-700">Manual OCR</h3>
          <p className="mb-2">Capture current screen manually</p>
          <div className="bg-gray-50 p-2 rounded">
            <LastOcrImage
              onDataChange={(data, error) => {
                if (error) {
                  addLog(`Manual OCR Error: ${error}`);
                  return;
                }

                if (data?.data?.length > 0) {
                  const text = data.data[0].content?.text;
                  if (text) {
                    addLog(`Manual OCR successful: ${text.length} chars`);
                    setLastOcrText(text);
                    detectNewMessages(text);
                  }
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-500 border-t pt-2 mt-4">
        <div className="flex justify-between">
          <h3 className="font-semibold mb-1">Requirements</h3>
          <p className="text-xs text-blue-500">
            Using: {aiProvider === "ollama" ? `Ollama (${ollamaModel})` : `Nebius (${nebiusModel})`}
          </p>
        </div>
        <ul className="list-disc pl-4 space-y-1">
          <li>Requires fixed window positioning</li>
          <li>Windows screen scaling must be 100%</li>
          <li>Application must be visible on screen</li>
        </ul>
      </div>
    </div>
  );
};

export default ChatAutomation;