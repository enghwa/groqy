import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { HfInference } from '@huggingface/inference';

import ReactMarkdown from 'react-markdown'; // Correct import

function GroqApp() {
  const [textInput, setTextInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [tokensPerSecond, setTokensPerSecond] = useState(0); // Placeholder
  const [isListening, setIsListening] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const recordingTimeRef = useRef(null);

  const [streamingOutput, setStreamingOutput] = useState('');
  const hf = new HfInference(); //
  hf.endpoint("https://groqapi.bababababanana.com")
  // const model = hf.endpoint(apiUrl("/v1/chat/completions"));


  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameIdRef.current);
      stopListening();
    };
  }, []);

  const handleClearChat = () => {
    setMessages([]); // Clear the messages array
    setStreamingOutput(''); // Clear any ongoing streaming output
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
        sendToLLM(transcript); // Send voice input directly to LLM
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

    // Send the request to the LLM when recording stops
    if (textInput.trim() !== '') {
      console.log("stopped")
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

    ctx.clearRect(0, 0, WIDTH, HEIGHT); // Clear the canvas
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
    setTextInput(''); // Clear input box after sending
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };


  const sendToLLM = async (text) => {
    //   console.log("sendtoLLM.....", text)

    const newMessage = {
      text: text,
      isUser: true 
    };

    setMessages(prevMessages => [...prevMessages, newMessage]);

    try {
      // Create a placeholder for the LLM's response
      const responseMessageId = `llm-response-${messages.length}`;
      setMessages(prevMessages => [
        ...prevMessages,
        { 
          id: responseMessageId,
          text: '', // Initially empty
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
            // Find the LLM response message and update its text
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
      // Consider setting an error message in the messages array
    }
  };



  return (
    <div className="app-container">

  <div className="chat-area"> {/* Combined chat area */}
      <div className="message-area">
      {messages.map((message, index) => (
        <div 
          key={index} 
          className={`message ${message.isUser ? 'user-bubble' : 'llm-bubble'}`}
        >
          {message.isUser 
            ? message.text // Direct text for user messages
            : <ReactMarkdown>{message.text}</ReactMarkdown> // Markdown for LLM
          }
        </div>
      ))}
      </div>

      <div className="input-area"> {/* Input area inside chat-area */}
      <div className="input-container">
          <div className="recording-controls">
            <button onClick={isListening ? stopListening : startListening}>
              <div
                className={`microphone-icon ${isListening ? 'recording' : ''}`}
              >
                🎤
              </div>
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
          <span onClick={handleClearChat} style={{ cursor: 'pointer' }}> {/* Make it clickable */}
            Clear chat
          </span>

      </div>
      </div>
      </div>
   
    </div>
  );
}

export default GroqApp;
