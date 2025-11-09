import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Tool } from '../constants/tools';
import { GoogleGenAI, Chat } from '@google/genai';
import SignaturePad from './SignaturePad';
import type { SignaturePadRef } from './SignaturePad';

declare var PDFLib: any;
declare var pdfjsLib: any;

interface ToolPageProps {
  tool: Tool;
  onBack: () => void;
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const ToolPage: React.FC<ToolPageProps> = ({ tool, onBack }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [splitRanges, setSplitRanges] = useState('1');
  const [signature, setSignature] = useState<string | null>(null);
  const sigPadRef = useRef<SignaturePadRef>(null);

  // State for Chat with PDF
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [chat, setChat] = useState<Chat | null>(null);
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [userQuery, setUserQuery] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory, isChatting]);


  const resetState = useCallback(() => {
    setFiles([]);
    setProcessing(false);
    setError(null);
    setResult(null);
    setSplitRanges('1');
    setSignature(null);
    if(sigPadRef.current) {
        sigPadRef.current.clear();
    }
    // Reset chat state
    setExtractedText(null);
    setChat(null);
    setChatHistory([]);
    setUserQuery('');
    setIsChatting(false);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    resetState();
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleProcess = async () => {
    if (files.length === 0) {
      setError('Please select one or more files.');
      return;
    }
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      switch (tool.id) {
        case 'merge-pdf':
          await handleMerge();
          break;
        case 'split-pdf':
          await handleSplit();
          break;
        case 'pdf-to-jpg':
          await handlePdfToJpg();
          break;
        case 'compress-pdf':
        case 'pdf-to-word':
        case 'pdf-to-powerpoint':
        case 'pdf-to-excel':
        case 'edit-pdf':
            await handleGeminiTask();
            break;
        case 'sign-pdf':
            await handleApplySignature();
            break;
        case 'chat-with-pdf':
            await handleChatSetup();
            break;
        default:
          throw new Error('This tool is not yet implemented.');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setProcessing(false);
    }
  };

  const handleMerge = async () => {
    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();
    for (const file of files) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }
    const pdfBytes = await mergedPdf.save();
    downloadFile(pdfBytes, 'merged.pdf', 'application/pdf');
    setProcessing(false);
  };
  
  const handleSplit = async () => {
    const { PDFDocument } = PDFLib;
    const arrayBuffer = await files[0].arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);
    
    const newPdf = await PDFDocument.create();
    const pageIndices = parsePageRanges(splitRanges, pdf.getPageCount());

    if (pageIndices.length === 0) {
        throw new Error("Invalid page range specified or no pages selected.");
    }

    const copiedPages = await newPdf.copyPages(pdf, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    downloadFile(pdfBytes, 'split.pdf', 'application/pdf');
    setProcessing(false);
  }

  const handlePdfToJpg = async () => {
    const arrayBuffer = await files[0].arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    const numPages = pdf.numPages;
    const images: string[] = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      images.push(canvas.toDataURL('image/jpeg'));
    }
    setResult({ images });
    setProcessing(false);
  };

  const handleGeminiTask = async () => {
    const file = files[0];
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ');
    }

    let prompt = '';
    let systemInstruction = 'You are a helpful assistant that processes document content.';
    switch(tool.id) {
        case 'compress-pdf':
            prompt = `Please provide a concise summary of the following document text:\n\n${fullText}`;
            systemInstruction = 'You are an expert summarizer. Create a summary of the provided text.';
            break;
        case 'pdf-to-word':
            prompt = `Format the following document text for easy pasting into a Word document. Maintain paragraphs and identify potential headings:\n\n${fullText}`;
            break;
        case 'pdf-to-powerpoint':
            prompt = `Create a presentation outline from the following text. For each slide, provide a title and a few bullet points:\n\n${fullText}`;
            break;
        case 'pdf-to-excel':
             prompt = `Extract any tabular data from the following text and present it in CSV format. If no tables are found, say so:\n\n${fullText}`;
             break;
        case 'edit-pdf':
            prompt = `Proofread and correct any grammatical errors in the following text. Only output the corrected text:\n\n${fullText}`;
            systemInstruction = "You are a meticulous proofreader. Correct grammar and spelling mistakes in the provided text.";
            break;
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction }
    });
    setResult({ text: response.text });
    setProcessing(false);
  }

  const handleChatSetup = async () => {
    const file = files[0];
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ');
    }
    setExtractedText(fullText);

    const chatSession = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: `You are a helpful assistant that answers questions based ONLY on the provided document context. Do not use external knowledge. If the answer is not in the text, say "I cannot find the answer in the document.". The document content is:\n\n---\n\n${fullText}`
        }
    });
    setChat(chatSession);
    setProcessing(false);
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuery.trim() || !chat || isChatting) return;

    const query = userQuery;
    setChatHistory(prev => [...prev, { role: 'user', text: query }]);
    setUserQuery('');
    setIsChatting(true);
    setError(null);
    
    try {
        const response = await chat.sendMessage({ message: query });
        setChatHistory(prev => [...prev, { role: 'model', text: response.text }]);
    } catch (err: any) {
        setError(err.message || 'Failed to get a response from the AI.');
    } finally {
        setIsChatting(false);
    }
}


  const handleApplySignature = async () => {
    if (!signature || files.length === 0) {
      setError('Please provide a signature and a PDF file.');
      setProcessing(false);
      return;
    }
    const { PDFDocument } = PDFLib;
    const pdfBytes = await files[0].arrayBuffer();
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pngImageBytes = await fetch(signature).then((res) => res.arrayBuffer());
    const pngImage = await pdfDoc.embedPng(pngImageBytes);
  
    const firstPage = pdfDoc.getPages()[0];
    const { width, height } = firstPage.getSize();
  
    // Place signature in the bottom right corner
    const imgWidth = 150;
    const imgHeight = (pngImage.height / pngImage.width) * imgWidth;
    firstPage.drawImage(pngImage, {
      x: width - imgWidth - 50,
      y: 50,
      width: imgWidth,
      height: imgHeight,
    });
  
    const signedPdfBytes = await pdfDoc.save();
    downloadFile(signedPdfBytes, 'signed.pdf', 'application/pdf');
    setProcessing(false);
  };

  const handleSaveSignature = () => {
    if (sigPadRef.current) {
      const sigDataUrl = sigPadRef.current.toDataURL();
      if (!sigDataUrl) {
        setError('Please draw a signature before saving.');
        return;
      }
      setError(null);
      setSignature(sigDataUrl);
    }
  };
  
  const handleClearSignature = () => {
    if (sigPadRef.current) {
      sigPadRef.current.clear();
    }
    setSignature(null);
  };
  
  const parsePageRanges = (rangeStr: string, maxPages: number): number[] => {
    const indices = new Set<number>();
    const parts = rangeStr.split(',');
    for (const part of parts) {
      const trimmedPart = part.trim();
      if (trimmedPart.includes('-')) {
        const [start, end] = trimmedPart.split('-').map(s => s.trim());
        const startNum = parseInt(start, 10);
        const endNum = end ? parseInt(end, 10) : maxPages;
        if (!isNaN(startNum) && !isNaN(endNum)) {
          for (let i = startNum; i <= endNum; i++) {
            if (i > 0 && i <= maxPages) indices.add(i - 1);
          }
        }
      } else {
        const num = parseInt(trimmedPart, 10);
        if (!isNaN(num) && num > 0 && num <= maxPages) {
          indices.add(num - 1);
        }
      }
    }
    return Array.from(indices).sort((a,b)=> a-b);
  };
  
  const downloadFile = (data: Uint8Array, filename: string, mimeType: string) => {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setResult({ downloaded: true, filename });
  };

  const renderToolOptions = () => {
    if (files.length === 0) return null;
    switch (tool.id) {
        case 'split-pdf':
            return (
                <div className="mt-4">
                    <label htmlFor="split-ranges" className="block text-sm font-medium text-gray-700">Pages to extract</label>
                    <input
                        type="text"
                        id="split-ranges"
                        value={splitRanges}
                        onChange={(e) => setSplitRanges(e.target.value)}
                        placeholder="e.g., 1, 3-5, 8"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-red-500 focus:ring-red-500 sm:text-sm"
                    />
                    <p className="mt-1 text-xs text-gray-500">Use commas to separate pages or ranges. E.g., 1, 3-5, 8.</p>
                </div>
            )
        default:
            return null;
    }
  }

  const renderSignPdfContent = () => {
    if (tool.id !== 'sign-pdf' || files.length === 0) return null;

    return (
        <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
                Step 2: Provide Your Signature
            </h3>
            {!signature ? (
                <div>
                    <p className="text-sm text-gray-600 mb-2">Draw your signature in the box below.</p>
                    <SignaturePad ref={sigPadRef} />
                    <div className="mt-4 flex justify-end space-x-3">
                        <button
                            onClick={handleClearSignature}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            Clear
                        </button>
                        <button
                            onClick={handleSaveSignature}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Save Signature
                        </button>
                    </div>
                </div>
            ) : (
                <div>
                    <p className="text-sm text-gray-600 mb-2">Your saved signature:</p>
                    <div className="p-4 border border-dashed border-gray-300 rounded-lg bg-gray-50 inline-block">
                        <img src={signature} alt="Your Signature" className="h-24" />
                    </div>
                    <div className="mt-4">
                         <button
                            onClick={handleClearSignature}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                           Draw a new signature
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
  };

  const isGeminiTool = ['compress-pdf', 'pdf-to-word', 'pdf-to-powerpoint', 'pdf-to-excel', 'edit-pdf', 'chat-with-pdf'].includes(tool.id);
  const isComingSoon = ['word-to-pdf', 'powerpoint-to-pdf', 'excel-to-pdf'].includes(tool.id);

  const renderContent = () => {
    if (tool.id === 'chat-with-pdf' && extractedText !== null) {
      return (
        <div className="w-full max-w-3xl mx-auto bg-white rounded-lg shadow-xl flex flex-col" style={{ height: '70vh' }}>
          <div className="p-4 border-b">
            <h3 className="text-lg font-semibold text-gray-800">Chat with: <span className="font-normal text-gray-600">{files[0].name}</span></h3>
          </div>
          <div ref={chatContainerRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
            {chatHistory.map((msg, index) => (
                <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                   {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">A</div> }
                    <div className={`max-w-md lg:max-w-xl px-4 py-3 rounded-lg shadow-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none'}`}>
                        {msg.text.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                    </div>
                </div>
            ))}
            {isChatting && (
                <div className="flex items-start gap-3 justify-start">
                     <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold flex-shrink-0">A</div>
                     <div className="max-w-md lg:max-w-xl px-4 py-3 rounded-lg shadow-sm bg-white text-gray-800 rounded-bl-none">
                        <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                     </div>
                </div>
            )}
          </div>
          {error && <div className="p-4 border-t text-red-600 bg-red-50">{error}</div>}
          <div className="p-4 border-t bg-white">
            <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                <input
                    type="text"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Ask a question about the document..."
                    disabled={isChatting}
                    className="flex-grow w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:bg-gray-100"
                />
                <button type="submit" disabled={isChatting || !userQuery.trim()} className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
            </form>
          </div>
        </div>
      );
    }
    
    if (result) {
        return (
            <div className="text-center">
                 <h3 className="text-2xl font-bold text-gray-800 mb-4">Processing Complete!</h3>
                {result.images && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-h-96 overflow-y-auto p-4 bg-gray-100 rounded-lg">
                        {result.images.map((imgSrc: string, index: number) => (
                           <a href={imgSrc} download={`page-${index+1}.jpg`} key={index} className="block border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                             <img src={imgSrc} alt={`Page ${index + 1}`} className="w-full h-auto" />
                           </a>
                        ))}
                    </div>
                )}
                {result.text && (
                     <textarea readOnly className="w-full h-64 p-2 border rounded-lg bg-gray-50 font-mono text-sm" value={result.text}></textarea>
                )}
                {result.downloaded && <p className="text-gray-600">Your file '{result.filename}' has been downloaded.</p>}
                 <button onClick={resetState} className="mt-6 bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors">Start Over</button>
            </div>
        )
    }

    const processButtonText = () => {
      if (tool.id === 'sign-pdf' && files.length > 0) return 'Apply Signature & Download';
      if (tool.id === 'chat-with-pdf' && files.length > 0) return 'Start Chatting';
      return tool.title;
    }

    return (
        <div className="w-full max-w-2xl mx-auto">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-white">
                <div className={`mx-auto h-12 w-12 ${tool.color}`}>
                    {tool.icon}
                </div>
                <label htmlFor="file-upload" className="mt-4 text-lg font-semibold text-gray-800 block cursor-pointer">
                    {files.length > 0 ? `${files.length} file(s) selected` : "Select PDF file"}
                </label>
                <p className="mt-1 text-sm text-gray-500">{tool.id === 'merge-pdf' ? 'Upload multiple PDFs to merge them.' : 'Upload the PDF you want to process.'}</p>
                <div className="mt-6">
                    <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        accept="application/pdf"
                        multiple={tool.id === 'merge-pdf'}
                        onChange={handleFileChange}
                    />
                    <label htmlFor="file-upload" className="cursor-pointer bg-red-600 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
                        Select PDF
                    </label>
                </div>
            </div>
            
            {files.length > 0 && (
                <div className="mt-4 bg-white p-4 rounded-lg shadow">
                    <h4 className="font-semibold text-gray-700">Selected files:</h4>
                    <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                        {files.map(f => <li key={f.name}>{f.name}</li>)}
                    </ul>
                </div>
            )}

            {isComingSoon && <div className="mt-6 p-4 bg-blue-100 border-l-4 border-blue-500 text-blue-700 rounded-r-lg">
                <p className="font-bold">Coming Soon!</p>
                <p>This feature requires server-side processing which is not available in this demo. Try a Gemini-powered tool like 'Compress PDF' to see AI in action!</p>
                </div>
            }

            {renderSignPdfContent()}
            {renderToolOptions()}

            {error && <div className="mt-4 text-red-600 bg-red-100 p-3 rounded-lg">{error}</div>}
            
            {!isComingSoon && <button
                onClick={handleProcess}
                disabled={processing || files.length === 0 || (tool.id === 'sign-pdf' && !signature)}
                className="w-full mt-6 bg-gray-800 text-white py-3 rounded-lg font-semibold text-lg hover:bg-gray-900 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
                {processing && <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>}
                <span>{processing ? 'Processing...' : processButtonText()}</span>
            </button>}
        </div>
    )
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <button onClick={onBack} className="flex items-center text-sm font-medium text-gray-600 hover:text-red-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back to all tools
        </button>
      </div>
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900">{tool.title}</h1>
        <p className="mt-3 max-w-2xl mx-auto text-lg text-gray-600">{tool.description}</p>
        {isGeminiTool && (
            <div className="mt-4 inline-block bg-purple-100 text-purple-800 text-sm font-medium mr-2 px-2.5 py-0.5 rounded-full">
                Powered by Gemini API
            </div>
        )}
      </div>
      {renderContent()}
    </div>
  );
};

export default ToolPage;