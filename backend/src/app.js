import React, { useState } from 'react';

export default function App() {
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [results, setResults] = useState([]);

  // Función simulada de búsqueda documental
  const handleSearch = () => {
    const mockResults = [
      {
        title: 'Revista Salesiana 1950',
        fragment: 'Don Bosco trabajó con jóvenes en...',
        date: '1950',
      },
    ];
    setResults(mockResults);
  };

  // Función simulada de chat RAG
  const handleSend = () => {
    if (!chatInput) return;

    const newMessages = [
      ...messages,
      { role: 'user', content: chatInput },
      { role: 'assistant', content: 'Respuesta generada basada en documentos históricos (simulación RAG).' },
    ];

    setMessages(newMessages);
    setChatInput('');
  };


};