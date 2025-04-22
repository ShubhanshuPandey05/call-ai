const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dotenv = require('dotenv');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('A user connected');
  
  let genAI = null;
  let model = null;
  let chat = null;
  let isProcessingAudio = false;
  
  socket.on('start_session', async () => {
    try {
      console.log('Starting new Gemini session...');
      
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      
      model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
      
      chat = model.startChat({
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048,
        },
        systemInstruction : {
          role: "system",
          parts: [
            {
              text: "You are a helpful voice assistant in a phone call. Respond naturally and conversationally, as if in a real phone call. Keep responses brief and concise as they will be spoken aloud. The user may interrupt you at any time, which is normal in conversation."
            }
          ]
        }
      });
      
      socket.emit('session_started');
      console.log('Call session started successfully');
    } catch (error) {
      console.error('Error starting Gemini session:', error.response?.data || error.message);
      socket.emit('error', { message: 'Failed to start call session: ' + (error.response?.data?.error?.message || error.message) });
    }
  });
  
  socket.on('send_audio', async (audioData) => {
    if (!chat) {
      socket.emit('error', { message: 'No active call session' });
      return;
    }
    
    // If already processing an audio, this is an interruption
    if (isProcessingAudio) {
      console.log('User interrupted - handling new audio input');
    }
    
    try {
      isProcessingAudio = true;
      console.log('Received audio chunk, processing...');
      
      // Convert base64 audio data to buffer
      // const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Create audio part for the message
      const audioPart = {
        inlineData: {
          data: audioData,
          mimeType: 'audio/webm;codecs=opus'
        }
      };
      
      // Send the audio to Gemini
      const result = await chat.sendMessage([audioPart]);
      const response = await result.response;
      // console.log(response)
      // const responseAudio = await response.audio();
      const responseText = response.text();
      
      // console.log('text:', responseText);
      socket.emit('audio_response', { text: responseText });
      
      isProcessingAudio = false;
      
    } catch (error) {
      console.error('Error processing audio:', error.response?.data || error.message);
      socket.emit('error', { message: 'Error processing audio: ' + (error.response?.data?.error?.message || error.message) });
      isProcessingAudio = false;
    }
  });
  
  socket.on('end_session', () => {
    chat = null;
    model = null;
    isProcessingAudio = false;
    console.log('Call ended');
    socket.emit('session_ended');
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
    chat = null;
    model = null;
    isProcessingAudio = false;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});