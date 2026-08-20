import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import "../Styles/Chatbot.css";

// Change this if your backend runs on a different port
const API_BASE = "https://chatbot-backend-f51e.onrender.com/api/chats";
const RAG_API_BASE = "https://chatbot-backend-f51e.onrender.com/api/rag";

export default function Chatbot() {
  const [chats, setChats] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [confirmingId, setConfirmingId] = useState(null); // chat waiting for delete confirmation
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentChat = chats.find((c) => c._id === currentChatId);
  const messages = currentChat ? currentChat.messages : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // load all chats from DB on first mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API_BASE);
        const data = await res.json();

        if (data.length === 0) {
          const created = await fetch(API_BASE, { method: "POST" }).then((r) =>
            r.json()
          );
          setChats([created]);
          setCurrentChatId(created._id);
        } else {
          setChats(data);
          setCurrentChatId(data[0]._id);
        }
      } catch (err) {
        console.error("Failed to load chats:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const startNewChat = async () => {
    try {
      const res = await fetch(API_BASE, { method: "POST" });
      const newChat = await res.json();
      setChats((prev) => [newChat, ...prev]);
      setCurrentChatId(newChat._id);
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  };

  const deleteChat = async (chatId) => {
    try {
      await fetch(`${API_BASE}/${chatId}`, { method: "DELETE" });

      setChats((prev) => {
        const updated = prev.filter((chat) => chat._id !== chatId);

        if (chatId === currentChatId) {
          setCurrentChatId(updated.length > 0 ? updated[0]._id : null);
        }

        return updated;
      });
    } catch (err) {
      console.error("Failed to delete chat:", err);
    } finally {
      setConfirmingId(null);
    }
  };

  const uploadFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    setUploadStatus("");

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadStatus(`⏳ Uploading ${i + 1}/${files.length}: ${file.name}`);

      const formData = new FormData();
      formData.append("file", file);
      if (currentChatId) {
        formData.append("chatId", currentChatId);
      }

      try {
        const res = await fetch(`${RAG_API_BASE}/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (!res.ok) {
          failCount++;
          console.error(`Failed: ${file.name}`, data.error);
        } else {
          successCount++;
        }
      } catch (err) {
        failCount++;
        console.error(`Failed: ${file.name}`, err);
      }
    }

    setIsUploading(false);
    e.target.value = "";

    // refresh chats so the "Got it — I've read X" message (pushed by the
    // backend) and the chat's activeDocument state show up immediately
    if (successCount > 0) {
      try {
        const res = await fetch(API_BASE);
        const data = await res.json();
        setChats(data);
      } catch (err) {
        console.error("Failed to refresh chats after upload:", err);
      }
    }

    if (failCount === 0) {
      setUploadStatus(`✅ ${successCount} file${successCount !== 1 ? "s" : ""} added successfully`);
    } else {
      setUploadStatus(`⚠️ ${successCount} added, ${failCount} failed — check unsupported file types`);
    }
    setTimeout(() => setUploadStatus(""), 5000);
  };

  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !currentChatId) return;

    setInput("");
    setIsTyping(true);

    try {
      const res = await fetch(`${API_BASE}/${currentChatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const updatedChat = await res.json();

      setChats((prev) =>
        prev.map((chat) => (chat._id === updatedChat._id ? updatedChat : chat))
      );
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsTyping(false);
    }
  };

  if (loading) {
    return <div className="app-container">Loading...</div>;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <button className="new-chat-btn" onClick={startNewChat}>
          + New Chat
        </button>

        {chats.map((chat) => (
          <div
            key={chat._id}
            className={`chat-item ${chat._id === currentChatId ? "active" : ""}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              onClick={() => {
                setCurrentChatId(chat._id);
                setConfirmingId(null);
              }}
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                cursor: "pointer",
              }}
            >
              {chat.title}
            </span>

            <button
              type="button"
              onClick={() => {
                if (confirmingId === chat._id) {
                  deleteChat(chat._id);
                } else {
                  setConfirmingId(chat._id);
                }
              }}
              title="Delete chat"
              style={{
                cursor: "pointer",
                padding: "4px 10px",
                background:
                  confirmingId === chat._id
                    ? "rgba(255, 92, 122, 0.25)"
                    : "transparent",
                border:
                  confirmingId === chat._id
                    ? "1px solid rgba(255, 92, 122, 0.5)"
                    : "none",
                borderRadius: "6px",
                color: confirmingId === chat._id ? "#ff8080" : "inherit",
                fontSize: confirmingId === chat._id ? "12px" : "14px",
                fontWeight: confirmingId === chat._id ? 600 : 400,
                lineHeight: 1,
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {confirmingId === chat._id ? "Delete?" : "⋮"}
            </button>
          </div>
        ))}
      </div>

      {/* Chat UI */}
      <div className="chatbot-wrapper">
        <div className="chatbot-window">
          <header className="chatbot-header" style={{ display: "flex", alignItems: "center" }}>
            <div className="chatbot-avatar">🤖</div>
            <div>
              <h1 className="chatbot-title">Cognix AI</h1>
              <p className="chatbot-status">
                <span className="status-dot" /> Online
              </p>
            </div>
          </header>

          {uploadStatus && (
            <div
              style={{
                padding: "6px 16px",
                fontSize: "13px",
                color: uploadStatus.startsWith("❌") ? "#ff5c5c" : "#4caf50",
              }}
            >
              {uploadStatus}
            </div>
          )}

          <div className="chatbot-messages">
            {messages.map((msg) => (
              <div
                key={msg._id}
                className={`chat-bubble-row ${
                  msg.sender === "user" ? "row-user" : "row-bot"
                }`}
              >
                <div
                  className={`chat-bubble ${
                    msg.sender === "user" ? "bubble-user" : "bubble-bot"
                  }`}
                >
                  {msg.attachment && (
                    <img
                      src={msg.attachment}
                      alt={msg.text}
                      style={{
                        maxWidth: "100%",
                        borderRadius: "10px",
                        marginBottom: "6px",
                        display: "block",
                      }}
                    />
                  )}
                  {msg.sender === "bot" ? (
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="chat-bubble-row row-bot">
                <div className="chat-bubble bubble-bot typing-bubble">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form className="chatbot-input-area" onSubmit={sendMessage}>
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp"
              multiple
              onChange={uploadFile}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              title="Upload one or more PDF, DOCX, or TXT files"
              style={{
                background: "transparent",
                border: "1px solid #555",
                borderRadius: "6px",
                padding: "8px 12px",
                cursor: isUploading ? "not-allowed" : "pointer",
                color: "inherit",
              }}
            >
              {isUploading ? "⏳" : "📎"}
            </button>
            <input
              type="text"
              className="chatbot-input"
              placeholder="Type a message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button
              type="submit"
              className="chatbot-send-btn"
              disabled={!input.trim()}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}