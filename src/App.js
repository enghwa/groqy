import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { HfInference } from '@huggingface/inference';
import ReactMarkdown from 'react-markdown'; 

function GroqApp() {
  const [textInput, setTextInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [tokensPerSecond, setTokensPerSecond] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const recordingTimeRef = useRef(null);

  const [streamingOutput, setStreamingOutput] = useState('');
  const hf = new HfInference(); 
  hf.endpoint("https://groqapi.bababababanana.com");


  const messageAreaRef = useRef(null);
  const chatAreaRef = useRef(null);

  
  useEffect(() => {
    // Scroll to the bottom whenever messages update
    if (messageAreaRef.current) {
      messageAreaRef.current.scrollTop = messageAreaRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
      stopListening();
    };
  }, []);

  const handleClearChat = () => {
    setMessages([]);
    setStreamingOutput('');
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const startListening = () => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();

      recognition.onstart = () => {
        setIsListening(true);
        setRecordingTime(0);
        startRecordingTimer();
        startAudioVisualization();
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('Voice Input Transcript:', transcript);
        sendToLLM(transcript); 
      };

      recognition.onend = () => {
        stopListening();
      };

      recognition.start();

    } else {
      alert('Speech recognition is not supported in your browser.');
    }
  };

  const stopListening = () => {
    setIsListening(false);
    stopRecordingTimer();
    stopAudioVisualization();

    if (textInput.trim() !== '') {
      handleSend();
    }
  };

  const startRecordingTimer = () => {
    const startTime = Date.now();
    recordingTimeRef.current = setInterval(() => {
      const elapsedTime = Date.now() - startTime;
      setRecordingTime(Math.floor(elapsedTime / 1000));
    }, 1000);
  };

  const stopRecordingTimer = () => {
    clearInterval(recordingTimeRef.current);
    setRecordingTime(0);
  };

  const startAudioVisualization = () => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    analyserRef.current = audioContextRef.current.createAnalyser();

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        visualize();
      })
      .catch(err => {
        console.error('Error accessing microphone:', err);
      });
  };

  const visualize = () => {
    const canvas = document.getElementById('analyzer');
    const ctx = canvas.getContext('2d');
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;

    analyserRef.current.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, WIDTH, HEIGHT); 
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#f0544f';
    ctx.beginPath();

    let sliceWidth = WIDTH * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      let v = dataArray[i] / 128.0;
      let y = v * HEIGHT / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();

    animationFrameIdRef.current = requestAnimationFrame(visualize);
  };

  const stopAudioVisualization = () => {
    cancelAnimationFrame(animationFrameIdRef.current);
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      audioContextRef.current.close();
    }
  };

  const handleInputChange = (e) => {
    setTextInput(e.target.value);
  };

  const handleSend = () => {
    console.log('Keyboard Input:', textInput);
    sendToLLM(textInput);
    setTextInput(''); 
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const sendToLLM = async (text) => {
    const newMessage = {
      text: text,
      isUser: true 
    };

    setMessages(prevMessages => [...prevMessages, newMessage]);

    try {
      const responseMessageId = `llm-response-${messages.length}`;
      setMessages(prevMessages => [
        ...prevMessages,
        { 
          id: responseMessageId,
          text: '', 
          isUser: false 
        },
      ]);

      for await (const chunk of hf.chatCompletionStream({
        endpointUrl: "https://groqapi.bababababanana.com",
        messages: [{ role: 'user', content: text }],
        max_tokens: 500,
        temperature: 0.1,
        seed: 0,
      })) {
        if (chunk.choices && chunk.choices.length > 0) {
          setMessages(prevMessages => {
            const updatedMessages = prevMessages.map(message => {
              if (message.id === responseMessageId) {
                return {
                  ...message,
                  text: message.text + (chunk.choices[0].delta.content || '')
                };
              }
              return message;
            });
            return updatedMessages;
          });
        }
      }
    } catch (error) {
      console.error('Error with LLM API:', error);
    }
  };

  return (
    <div className="app-container">
       <div className="chat-area" ref={chatAreaRef}> 
      <div className="message-area" ref={messageAreaRef}>
          {messages.map((message, index) => (
            <div 
              key={index} 
              className={`message ${message.isUser ? 'user-bubble' : 'llm-bubble'}`}
            >
              {message.isUser 
                ? message.text 
                : <ReactMarkdown>{message.text}</ReactMarkdown> 
              }
            </div>
          ))}
        </div>

      {/* Fixed Input Area */}
    <div className="fixed-input-area"> 
          <div className="input-container">
            <div className="recording-controls">
              <button onClick={isListening ? stopListening : startListening}>
                {/* <div
                  className={`microphone-icon ${isListening ? 'recording' : ''}`}
                >
                  🎤
                </div> */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-mic">
              <path d="M12 1 3 18a9 9 0 0 0 9 9v1h1v-1a9 9 0 0 0 9-9 9 9 0 0 0-9-9z" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
              </button>
              {isListening && (
                <span className="recording-time">{formatTime(recordingTime)}</span>
              )}
              {isListening && <canvas id="analyzer" height="40"></canvas>}
            </div>

            <input
              type="text"
              value={textInput}
              onChange={handleInputChange} 
              onKeyDown={handleKeyDown} 
              placeholder="Try it"
            />
            <button onClick={handleSend}>
              <span role="img" aria-label="Send">
                ✈️
              </span>
            </button>
          </div>
          <div className="options">
            <span onClick={handleClearChat} style={{ cursor: 'pointer' }}> 
              Clear chat
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GroqApp;