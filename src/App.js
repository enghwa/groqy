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
  const [recognitionInstance, setRecognitionInstance] = useState(null);
  const [contextMessages, setContextMessages] = useState([]);
  const MAX_CONTEXT_MESSAGES = 45; // Adjust this number as needed

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const recordingTimeRef = useRef(null);

  const [streamingOutput, setStreamingOutput] = useState('');
  const hf = new HfInference();
  
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

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const startListening = () => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang =  'en-US'; //'zh-CN';

      recognition.onstart = () => {
        setIsListening(true);
        setRecordingTime(0);
        startRecordingTimer();
        startAudioVisualization();
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log('onresult Voice Input Transcript:', transcript);
        sendToLLM(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
        stopRecordingTimer();
        stopAudioVisualization();
      };

      recognition.start();
      setRecognitionInstance(recognition);

    } else {
      alert('Speech recognition is not supported in your browser.');
    }
  };

  const stopListening = () => {
    if (recognitionInstance) {
      recognitionInstance.stop();
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

    if (text.trim() === '') {
      console.log("nothing to do.")
      return
    }

    // Update messages and context
    setMessages(prevMessages => [...prevMessages, newMessage]);
    updateContext(newMessage);

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

      // Prepare the context for the LLM request
      const llmContext = [
        {role: 'system', content: 'This is a conversation between Bobby, a friendly chatbot. Bobby is helpful, kind and honest. You must keep response below 200 words or less. Summarize long responses and ask for followup questions.'},
        ...contextMessages.map(msg => ({
          role: msg.isUser ? 'user' : 'assistant',
          content: msg.text
        })),
        { role: 'user', content: text }
      ];

      for await (const chunk of hf.chatCompletionStream({
        endpointUrl: "https://groqapi.bababababanana.com",
        messages: llmContext,
        max_tokens: 1500,
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

      // Update context with the LLM's response
      setMessages(prevMessages => {
        const lastMessage = prevMessages[prevMessages.length - 1];
        updateContext(lastMessage);
        return prevMessages;
      });

    } catch (error) {
      console.error('Error with LLM API:', error);
    }
  };

  const updateContext = (newMessage) => {
    setContextMessages(prevContext => {
      const updatedContext = [...prevContext, newMessage];
      if (updatedContext.length > MAX_CONTEXT_MESSAGES) {
        return updatedContext.slice(-MAX_CONTEXT_MESSAGES);
      }
      return updatedContext;
    });
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
          <div className={`input-container ${isListening ? 'recording' : ''}`}>
            <div className="recording-controls">
            <button 
              onClick={toggleListening} 
              className={`microphone-button ${isListening ? 'recording' : ''}`}
            >
            <svg fill="#000000" width="800px" height="800px" viewBox="0 0 256 256" id="Flat" xmlns="http://www.w3.org/2000/svg"  className="feather feather-mic">
              <path d="M128,172a52.059,52.059,0,0,0,52-52V64A52,52,0,0,0,76,64v56A52.059,52.059,0,0,0,128,172ZM100,64a28,28,0,0,1,56,0v56a28,28,0,0,1-56,0Zm40,147.21753V232a12,12,0,0,1-24,0V211.21753A92.13808,92.13808,0,0,1,36,120a12,12,0,0,1,24,0,68,68,0,0,0,136,0,12,12,0,0,1,24,0A92.13808,92.13808,0,0,1,140,211.21753Z"/>
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
            <button onClick={handleSend} className="send-button">
            
            <svg aria-label="send" role="img" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 -960 960 960" 
             className="feather feather-send"><path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z"></path>
            </svg>

          </button>

          </div>
          
          <div className={`options ${isListening ? 'recording' : ''}`}>
            <button onClick={handleClearChat} className="clear-chat-button" aria-label="Clear chat">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-trash-2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
              
            </button>
          </div>
        </div>
      
      
      </div>
    </div>
  );
}

export default GroqApp;
