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
  hf.endpoint("")
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
        setTextInput(transcript);
        console.log('Transcript:', transcript);
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

  const handleSend = async () => {
    if (textInput.trim() === '') return;

    const newMessage = {
      text: textInput,
      isUser: true
    };

    setMessages(prevMessages => [...prevMessages, newMessage]);
    setTextInput('');
    setStreamingOutput(''); // Clear previous output


    try {
      for await (const chunk of hf.chatCompletionStream({
        endpointUrl: ""https://groqapi.bababababanana.com",
        messages: [{ role: "user", content: textInput }], // Send user input
        max_tokens: 500,
        temperature: 0.1,
        seed: 0,
      })) {
        if (chunk.choices && chunk.choices.length > 0) {
          setStreamingOutput(prevOutput =>
            prevOutput + (chunk.choices[0].delta.content || '')
          );
        }
      }
    } catch (error) {
      console.error('Error with LLM API:', error);
      // Handle the error appropriately (e.g., display an error message)
    }
  };


  return (
    <div className="app-container">
      <div className="input-area">
        <div className="input-container">
          <button onClick={isListening ? stopListening : startListening}>
            <div className={`microphone-icon ${isListening ? 'recording' : ''}`}>
              🎤
            </div>
            {isListening && <span className="recording-time">{recordingTime}</span>}
          </button>

          {/* Canvas for Audio Visualization (moved outside the button) */}
          {/* Conditionally render the canvas */}
          {isListening && (
            <canvas id="analyzer" height="50"></canvas>
          )}

          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
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

      <div className="message-area">
        {/* ... (map through messages) */}
        {/* <div className="message bot-message">{streamingOutput}</div> */}
        {/* <div className="message bot-message" dangerouslySetInnerHTML={{ innerHTML: Marked(streamingOutput) }} />  */}
        <div className="message bot-message">
          <ReactMarkdown>{streamingOutput}</ReactMarkdown>
        </div>
      </div>

      <div className="extra-options">
        <button>
          <span role="img" aria-label="Square">
            ⏹️
          </span>
        </button>
        <button>
          <span role="img" aria-label="Right Arrow">
            ➡️
          </span>
        </button>
        <button>
          <span role="img" aria-label="Lines">
            ☰
          </span>
        </button>
      </div>
    </div>
  );
}

export default GroqApp;
