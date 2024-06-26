'use client'

import React, { useState, useRef, useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import RecordRTC from 'recordrtc';

declare const window: any;

const SpeakingPage = () => {
    const [prompt, setPrompt] = useState('');
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [rating, setRating] = useState('');
    const [feedback, setFeedback] = useState('');
    const [wordsPerMinute, setWordsPerMinute] = useState(0);
    const [fluency, setFluency] = useState('');
    const [taskType, setTaskType] = useState<number | null>(null);
    const [timeLeft, setTimeLeft] = useState(120); // 2 minutes countdown for Task 2
    const [records, setRecords] = useState<any[]>([]); // State to store past records
    const recognitionRef = useRef<any>(null);
    const startTimeRef = useRef<number | null>(null);
    const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null);
    const mediaRecorderRef = useRef<RecordRTC | null>(null);
    const audioBlobRef = useRef<Blob | null>(null);

    const getRandomPrompt = (task: number) => {
        const taskMessages: { [key: number]: string } = {
            1: "Give me about 7 words speaking prompt for IELTS Speaking Task 1 without bold, highlighted text or special start character",
            2: "Give me about 15 words speaking prompt for IELTS Speaking Task 2 without bold, highlighted text or special start character",
            3: "Give me about 20 words speaking prompt for IELTS Speaking Task 3 without bold, highlighted text or special start character",
            4: "Give me about 25 words speaking prompt for IELTS Speaking Task 4 without bold, highlighted text or special start character"
        };

        setTaskType(task);

        fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer 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`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "openai/gpt-4o",
                "messages": [
                    { "role": "user", "content": taskMessages[task] },
                ],
            })
        })
        .then(response => response.json())
        .then(data => {
            const messageContent = data.choices[0].message.content;
            setPrompt(messageContent);
        })
        .catch(error => {
            console.error('Error:', error);
            setError('An error occurred while fetching the prompt.');
        });
    };

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (taskType === 2 && isLoading && timeLeft > 0) {
            timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
        } else if (timeLeft === 0) {
            stopSpeechRecognition();
        }
        return () => clearTimeout(timer);
    }, [timeLeft, isLoading, taskType]);

    useEffect(() => {
        const savedRecords = JSON.parse(localStorage.getItem('speakingRecords') || '[]');
        if (Array.isArray(savedRecords)) {
            setRecords(savedRecords);
        } else {
            console.error('Records retrieved from localStorage are not an array:', savedRecords);
        }
    }, []);

    const handleSaveRecord = () => {
        if (rating && feedback && wordsPerMinute && fluency) {
            saveRecord(transcript, prompt, audioBlobRef.current, rating, feedback, wordsPerMinute, fluency);
        }
    };

    const rateTranscript = (transcript: string, prompt: string) => {
        fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer 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`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "openai/gpt-4o",
                "messages": [
                    { "role": "user", "content": `Rate the following transcript based on the IELTS Speaking band without asterick character in returned rating, then each part of the returned rating start with an hyphen, with overall band score on the first line start with "- Overall Speaking Band Score: ". Prompt: "${prompt}". Transcript: "${transcript}"` },
                ],
            })
        })
        .then(response => response.json())
        .then(data => {
            const messageContent = data.choices[0].message.content;
            setRating(messageContent);
            checkRecordingCompletion(); // Check if recording completion tasks are done
        })
        .catch(error => {
            console.error('Error:', error);
            setError('An error occurred while rating the transcript.');
        });
    };

    const getFeedback = (transcript: string, prompt: string) => {
        fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer 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`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "openai/gpt-4o",
                "messages": [
                    { "role": "user", "content": `Give feedback for improvement and an short example answer script based on the IELTS Speaking band without Fluency, Coherance feedback, without asterick character in returned feedback, then each part of the returned feedback start with an hyphen. Prompt: "${prompt}". Transcript: "${transcript}"` },
                ],
            })
        })
        .then(response => response.json()) 
        .then(data => {
            const messageContent = data.choices[0].message.content;
            setFeedback(messageContent);
            checkRecordingCompletion(); // Check if recording completion tasks are done
        })
        .catch(error => {
            console.error('Error:', error);
            setError('An error occurred while getting feedback.');
        });
    };

    const checkRecordingCompletion = () => {
        if (rating && feedback) {
            handleSaveRecord();
        }
    };

    const startSpeechRecognition = () => {
        setIsLoading(true);
        setTranscript(''); // Clear the transcript when starting a new recording
        setError('');
        setRating('');
        setFeedback('');
        setWordsPerMinute(0);
        setFluency('');
        startTimeRef.current = Date.now(); // Record the start time
        setTimeLeft(120); // Reset the timer for Task 2

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError('Speech recognition is not supported in this browser.');
            setIsLoading(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.continuous = true; // Allows for continuous speech recognition
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const result = event.results[event.resultIndex][0].transcript;
            setTranscript(prev => prev + ' ' + result);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('Speech recognition error:', event.error);
            setError('An error occurred during speech recognition');
            setIsLoading(false);
        };

        recognition.onend = () => {
            setIsLoading(false);
            calculateWordsPerMinute(); // Calculate words per minute when recognition ends
            rateTranscript(transcript, prompt); // Rate the transcript after stopping
            getFeedback(transcript, prompt); // Get feedback after stopping
        };

        recognition.start();

        // Start audio recording
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            const mediaRecorder = new RecordRTC(stream, {
                type: 'audio',
                mimeType: 'audio/wav',
                recorderType: RecordRTC.StereoAudioRecorder,
                desiredSampRate: 16000,
            });
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.startRecording();
        }).catch(error => {
            console.error('Error accessing media devices:', error);
            setError('An error occurred while accessing media devices.');
            setIsLoading(false);
        });
    };

    const stopSpeechRecognition = () => {
        setIsLoading(false);
        if (recognitionRef.current) {
            recognitionRef.current.stop();
        }
        if (mediaRecorderRef.current) {
            mediaRecorderRef.current.stopRecording(() => {
                const audioBlob = mediaRecorderRef.current!.getBlob();
                audioBlobRef.current = audioBlob; // Save the audio blob to a ref for later use
            });
        }
    };

    const calculateWordsPerMinute = () => {
        const words = transcript.trim().split(/\s+/).length;
        const durationInMinutes = (Date.now() - (startTimeRef.current || Date.now())) / 1000 / 60;
        const wpm = Math.round(words / durationInMinutes);
        setWordsPerMinute(wpm);
        setFluency(wpm > 100 ? 'Fast' : wpm < 70 ? 'Slow' : 'Normal');
    };

    const saveRecord = (transcript: string, prompt: string, audioBlob: Blob | null, rating: string, feedback: string, wpm: number, fluency: string) => {
        const newRecord = {
            id: Date.now(),
            transcript,
            prompt,
            audioURL: audioBlob ? URL.createObjectURL(audioBlob) : null,
            rating,
            feedback,
            wpm,
            fluency,
            recordedTime: new Date().toLocaleString() // Add recorded time
        };

        const updatedRecords = [...records, newRecord];
        setRecords(updatedRecords);
        localStorage.setItem('speakingRecords', JSON.stringify(updatedRecords));
    };

    const clearPastRecords = () => {
        setRecords([]);
        localStorage.removeItem('speakingRecords');
    };

    const [expandedRecords, setExpandedRecords] = useState<number[]>([]);

    const toggleRecordExpansion = (recordId: number) => {
        setExpandedRecords((prevExpandedRecords) =>
            prevExpandedRecords.includes(recordId)
                ? prevExpandedRecords.filter((id) => id !== recordId)
                : [...prevExpandedRecords, recordId]
        );
    };

    const renderRecordText = (text: string, recordId: number) => {
        const isExpanded = expandedRecords.includes(recordId);
        const limit = 50;
        if (text.length <= limit) {
            return text;
        }
        return (
            <span>
                {isExpanded ? text : `${text.slice(0, limit)}...`}
                <button onClick={() => toggleRecordExpansion(recordId)} className="ml-2 text-blue-500 hover:underline">
                    {isExpanded ? 'See Less' : 'See More'}
                </button>
            </span>
        );
    };

    return (
        <div>
            <Header />
            <main className="container mx-auto p-4">
                <h1 className="text-2xl font-bold mb-4">IELTS Speaking Practice</h1>
                <div className="mb-4">
                    <button onClick={() => getRandomPrompt(1)} className="mr-2 p-2 bg-blue-500 text-white rounded">Task 1</button>
                    <button onClick={() => getRandomPrompt(2)} className="mr-2 p-2 bg-blue-500 text-white rounded">Task 2</button>
                    <button onClick={() => getRandomPrompt(3)} className="mr-2 p-2 bg-blue-500 text-white rounded">Task 3</button>
                    <button onClick={() => getRandomPrompt(4)} className="p-2 bg-blue-500 text-white rounded">Task 4</button>
                </div>
                {prompt && (
                    <div className="mb-4 p-4 border rounded">
                        <p className="mb-2"><strong>Prompt:</strong> {prompt}</p>
                        {taskType === 2 && (
                            <p className="mb-2"><strong>Time Left:</strong> {timeLeft} seconds</p>
                        )}
                        {isLoading ? (
                            <button onClick={stopSpeechRecognition} className="p-2 bg-red-500 text-white rounded">Stop</button>
                        ) : (
                            <button onClick={startSpeechRecognition} className="p-2 bg-green-500 text-white rounded">Start</button>
                        )}
                    </div>
                )}
                {error && (
                    <div className="mb-4 p-4 border border-red-500 rounded text-red-500">
                        {error}
                    </div>
                )}
                <div className="mb-4 p-4 border rounded">
                    <h2 className="text-xl font-bold mb-2">Transcript</h2>
                    <p>{transcript}</p>
                </div>
                <div className="mb-4 p-4 border rounded">
                    <h2 className="text-xl font-bold mb-2">Rating</h2>
                    <pre className="whitespace-pre-wrap">{rating}</pre>
                </div>
                <div className="mb-4 p-4 border rounded">
                    <h2 className="text-xl font-bold mb-2">Feedback</h2>
                    <pre className="whitespace-pre-wrap">{feedback}</pre>
                </div>
                <div className="mb-4 p-4 border rounded">
                    <h2 className="text-xl font-bold mb-2">Words Per Minute</h2>
                    <p>{wordsPerMinute}</p>
                </div>
                <div className="mb-4 p-4 border rounded">
                    <h2 className="text-xl font-bold mb-2">Fluency</h2>
                    <p>{fluency}</p>
                </div>
                <div className="mb-4 p-4 border rounded">
                    <h2 className="text-xl font-bold mb-2">Past Records</h2>
                    <button onClick={clearPastRecords} className="p-2 bg-red-500 text-white rounded mb-4">Clear Past Records</button>
                    {Array.isArray(records) ? (
                        records.length === 0 ? (
                            <p>No records found.</p>
                        ) : (
                            records.map(record => (
                                <div key={record.id} className="mb-4 p-4 border rounded">
                                    <p><strong>Recorded Time:</strong> {record.recordedTime}</p> {/* Display recorded time */}
                                    <p><strong>Prompt:</strong> {record.prompt}</p>
                                    <p><strong>Transcript:</strong> {record.transcript}</p>
                                    <p><strong>Rating:</strong> <pre className="whitespace-pre-wrap">{renderRecordText(record.rating, record.id)}</pre></p> {/* Display rating with See More */}
                                    <p><strong>Feedback:</strong> <pre className="whitespace-pre-wrap">{renderRecordText(record.feedback, record.id)}</pre></p> {/* Display feedback with See More */}
                                    <p><strong>Words Per Minute:</strong> {record.wpm}</p>
                                    <p><strong>Fluency:</strong> {record.fluency}</p>
                                    {record.audioURL && (
                                        <audio controls>
                                            <source src={record.audioURL} type="audio/wav" />
                                            Your browser does not support the audio element.
                                        </audio>
                                    )}
                                </div>
                            ))
                        )
                    ) : (
                        <p>Error: records is not an array.</p>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default SpeakingPage;
