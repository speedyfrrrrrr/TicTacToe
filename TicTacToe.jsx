import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';

// Use your actual backend server URL here. 
// For local development, this is typically http://localhost:3000.
const SOCKET_SERVER_URL = 'http://localhost:3000'; 

// Initialize Socket.IO connection instance outside of the component 
// to prevent re-initialization on every render, but only connect on mount.
const socket = io(SOCKET_SERVER_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'], // Ensure compatibility
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
});

// Default state structure matching the server's output
const initialGameState = {
    roomId: null,
    board: Array(9).fill(null),
    turn: 'X',
    winner: null,
    winLine: null,
    isStarted: false,
    playerCount: 0,
    waitingForOpponent: true,
    playerXId: null,
    playerOId: null,
    lastMove: null
};

// Main application component
const App = () => {
    const [gameState, setGameState] = useState(initialGameState);
    const [playerMarker, setPlayerMarker] = useState(null);
    const [view, setView] = useState('lobby'); // 'lobby', 'join', 'game'
    const [error, setError] = useState(null);
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [isConnected, setIsConnected] = useState(socket.connected);

    // --- Connection and Socket Listener Setup ---
    useEffect(() => {
        // Connect the socket on component mount
        socket.connect();

        // Socket connection listeners
        const onConnect = () => {
            console.log('Connected to server:', socket.id);
            setIsConnected(true);
        };

        const onDisconnect = (reason) => {
            console.log('Disconnected from server:', reason);
            setIsConnected(false);
            if (reason === 'io server disconnect') {
                // The server forcefully disconnected us, try to reconnect
                socket.connect();
            }
        };

        // Game state update listener
        const onGameState = (state) => {
            console.log('Received Game State:', state);
            setGameState(state);
            setView('game'); // Force transition to game view on receiving state
        };

        // Initial room assignment listener
        const onJoinedRoom = ({ roomId, marker }) => {
            setPlayerMarker(marker);
            console.log(`Joined room ${roomId} as ${marker}`);
        };

        // Error handler
        const onError = (message) => {
            setError(message);
            console.error('Server Error:', message);
            // Clear error after a short delay
            setTimeout(() => setError(null), 5000);
        };

        // Rematch confirmation listener (for simple board clear sync)
        const onRematchStarted = () => {
            console.log('Rematch signal received.');
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('gameState', onGameState);
        socket.on('joinedRoom', onJoinedRoom);
        socket.on('error', onError);
        socket.on('rematchStarted', onRematchStarted);

        // Cleanup function
        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('gameState', onGameState);
            socket.off('joinedRoom', onJoinedRoom);
            socket.off('error', onError);
            socket.off('rematchStarted', onRematchStarted);
            socket.disconnect(); // Disconnect when component unmounts
        };
    }, []);

    // --- Action Handlers ---

    // Handles Quick Match button click
    const handleQuickMatch = () => {
        if (isConnected) {
            socket.emit('quickMatch');
        } else {
            setError('Not connected to the server. Please check your connection.');
        }
    };

    // Handles Create Room button click
    const handleCreateRoom = () => {
        if (isConnected) {
            socket.emit('createRoom');
        } else {
            setError('Not connected to the server. Please check your connection.');
        }
    };

    // Handles Join Room (by code input) submission
    const handleJoinRoom = () => {
        if (isConnected && roomCodeInput.length === 5) {
            socket.emit('joinRoomById', roomCodeInput.toUpperCase());
        } else {
            setError('Please enter a valid 5-character room code.');
        }
    };

    // Handles cell click (making a move)
    const handleMove = (index) => {
        if (isConnected && gameState.isStarted && !gameState.winner && gameState.turn === playerMarker && gameState.board[index] === null) {
            socket.emit('makeMove', index);
        } else if (gameState.winner) {
            // No action: game is over
        } else if (gameState.turn !== playerMarker) {
             setError("It's not your turn!");
             setTimeout(() => setError(null), 2000);
        }
    };

    // Handles Play Again button click
    const handlePlayAgain = () => {
        if (isConnected && gameState.winner) {
            socket.emit('playAgain');
        }
    };

    // Handles Leave Room button click, returns to lobby
    const handleLeaveRoom = () => {
        if (isConnected && gameState.roomId) {
            socket.emit('leaveRoom');
        }
        setGameState(initialGameState);
        setPlayerMarker(null);
        setView('lobby');
        setError(null);
    };

    // --- Derived State for UI ---

    const currentStatus = useMemo(() => {
        if (!isConnected) return "Offline. Check connection.";
        if (gameState.winner) {
            if (gameState.winner === 'Draw') return "It's a Draw!";
            if (gameState.winner === 'Opponent Left') return "Opponent disconnected. Game ended.";
            return `${gameState.winner} Wins!`;
        }
        if (gameState.waitingForOpponent) return `Waiting for opponent... Share code: ${gameState.roomId}`;
        
        const myTurn = gameState.turn === playerMarker;
        return myTurn ? "Your Turn!" : `Opponent's Turn (${gameState.turn})`;
    }, [gameState, playerMarker, isConnected]);

    const isMyTurn = gameState.turn === playerMarker && !gameState.winner && gameState.isStarted;

    // --- UI Helper Components ---

    // Board Cell Component
    const Cell = ({ value, index }) => {
        const isWinningCell = gameState.winLine && gameState.winLine.includes(index);
        const isLastMove = gameState.lastMove === index && !gameState.winner;
        
        // Base classes for the cell
        let classes = 'w-full h-full flex items-center justify-center text-5xl font-extrabold cursor-pointer transition-all duration-200 rounded-lg shadow-inner';
        
        // Border classes (simulating the grid)
        if (index % 3 !== 2) classes += ' border-r-4 border-gray-300';
        if (index < 6) classes += ' border-b-4 border-gray-300';
        
        // Hover/Interaction classes
        if (value === null && isMyTurn) {
            classes += ' hover:bg-gray-100 active:bg-gray-200';
        } else {
            classes += ' cursor-default';
        }

        // Marker color classes
        if (value === 'X') {
            classes += ' text-indigo-600';
        } else if (value === 'O') {
            classes += ' text-pink-600';
        }

        // Highlight classes
        if (isLastMove) {
            classes += ' bg-yellow-100/70 border-yellow-300 ring-4 ring-yellow-400 ring-opacity-50';
        }
        if (isWinningCell) {
            classes += ' bg-green-200/90 border-green-500 text-white shadow-xl animate-pulse';
            classes = classes.replace('text-indigo-600', 'text-green-800').replace('text-pink-600', 'text-green-800');
        }


        return (
            <div
                className={classes}
                onClick={() => handleMove(index)}
                style={{ aspectRatio: '1 / 1' }} // Ensure square aspect ratio
            >
                {value}
            </div>
        );
    };

    // Lobby View
    const Lobby = () => (
        <div className="flex flex-col space-y-4 w-full max-w-sm">
            <h2 className="text-3xl font-bold text-gray-800">Start a Game</h2>
            
            <button
                onClick={handleQuickMatch}
                className="w-full bg-indigo-600 text-white font-semibold py-3 px-4 rounded-xl shadow-lg hover:bg-indigo-700 transition duration-150"
            >
                <i className="fas fa-random mr-2"></i> Quick Match
            </button>
            
            <button
                onClick={handleCreateRoom}
                className="w-full bg-blue-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg hover:bg-blue-600 transition duration-150"
            >
                <i className="fas fa-plus mr-2"></i> Create Room (Invite Friend)
            </button>

            <div className="flex flex-col space-y-2 pt-4 border-t border-gray-200">
                <p className="text-lg font-medium text-gray-700">Join by Code:</p>
                <div className="flex space-x-2">
                    <input
                        type="text"
                        placeholder="Enter 5-digit Room Code"
                        value={roomCodeInput}
                        onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().slice(0, 5))}
                        maxLength={5}
                        className="flex-grow p-3 border-2 border-gray-300 rounded-xl font-mono text-center text-lg uppercase focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                        onClick={handleJoinRoom}
                        disabled={roomCodeInput.length !== 5}
                        className="bg-green-500 text-white font-semibold py-3 px-4 rounded-xl shadow-md hover:bg-green-600 disabled:bg-green-300 transition duration-150"
                    >
                         <i className="fas fa-sign-in-alt"></i>
                    </button>
                </div>
            </div>
        </div>
    );

    // Game View
    const GameBoard = () => (
        <div className="flex flex-col items-center w-full max-w-lg p-4">
            
            {/* Game Info Panel */}
            <div className="w-full bg-white rounded-xl shadow-xl p-4 mb-6 border-b-4 border-indigo-500">
                <div className="flex justify-between items-center text-sm font-medium text-gray-500 mb-2">
                    <span>Room ID: <span className="font-mono text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-base">{gameState.roomId}</span></span>
                    <span className="flex items-center">
                        <span className={`h-3 w-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'} ring-1 ${isConnected ? 'ring-green-300' : 'ring-red-300'} animate-pulse`}></span>
                        {isConnected ? 'Online' : 'Reconnecting...'}
                    </span>
                </div>

                <h1 className={`text-2xl font-extrabold text-center ${gameState.winner ? 'text-red-600' : isMyTurn ? 'text-indigo-600' : 'text-gray-700'}`}>
                    {currentStatus}
                </h1>
                
                <p className="text-center mt-1 text-lg">
                    You are: 
                    <span className={`font-black text-xl ml-1 ${playerMarker === 'X' ? 'text-indigo-600' : 'text-pink-600'}`}>
                        {playerMarker}
                    </span>
                </p>
                
                {/* Rematch / Leave Buttons */}
                {(gameState.winner || gameState.waitingForOpponent) && (
                    <div className="flex justify-center space-x-4 mt-4">
                        {gameState.winner && gameState.winner !== 'Opponent Left' && gameState.playerCount === 2 && (
                             <button
                                onClick={handlePlayAgain}
                                className="bg-green-500 text-white font-semibold py-2 px-4 rounded-lg shadow hover:bg-green-600 transition duration-150"
                            >
                                <i className="fas fa-redo mr-2"></i> Play Again
                            </button>
                        )}
                        <button
                            onClick={handleLeaveRoom}
                            className="bg-red-500 text-white font-semibold py-2 px-4 rounded-lg shadow hover:bg-red-600 transition duration-150"
                        >
                            <i className="fas fa-sign-out-alt mr-2"></i> Leave Room
                        </button>
                    </div>
                )}
            </div>

            {/* Tic-Tac-Toe Board Grid */}
            <div 
                className={`grid grid-cols-3 grid-rows-3 w-full max-w-[400px] bg-white rounded-xl p-3 shadow-2xl transition-opacity duration-500 ${gameState.waitingForOpponent ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}
                style={{ aspectRatio: '1 / 1' }} // Force the board to be square
            >
                {gameState.board.map((value, index) => (
                    <Cell key={index} value={value} index={index} />
                ))}
            </div>

            {/* Error Message */}
            {error && (
                <div className="mt-4 p-3 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-lg shadow-md w-full max-w-sm text-center">
                    <p className="font-medium">{error}</p>
                </div>
            )}
        </div>
    );

    // --- Main Render ---
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-sans">
            <header className="mb-8 text-center">
                <h1 className="text-4xl font-black text-gray-900 border-b-4 border-pink-500 pb-2">
                    Real-Time Tic-Tac-Toe
                </h1>
            </header>
            
            <main className="w-full flex justify-center">
                {view === 'lobby' ? <Lobby /> : <GameBoard />}
            </main>
        </div>
    );
};

export default App;