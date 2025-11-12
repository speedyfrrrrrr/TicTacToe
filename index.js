const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configure CORS for the frontend (assuming it runs on a different port/domain)
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity in MVP, but should be specific in production
        methods: ["GET", "POST"]
    }
});

// --- Server-side Game State Management ---
// rooms: { [roomId]: { players: { [socketId]: 'X' | 'O' }, board: Array(9), turn: 'X' | 'O', winner: null | 'X' | 'O' | 'Draw', waitingForOpponent: Boolean } }
const rooms = {};

// Helper function to generate a unique, short Room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// Helper function to check for a win
function checkWin(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
        [0, 4, 8], [2, 4, 6]             // Diagonals
    ];

    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], line: [a, b, c] };
        }
    }
    return null;
}

// Helper function to check for a draw
function checkDraw(board) {
    return !checkWin(board) && board.every(cell => cell !== null);
}

// Initializes a new game state
function initializeGameState() {
    return {
        players: {}, // socketId -> 'X' or 'O'
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        winLine: null,
        waitingForOpponent: true,
        isStarted: false,
        playerCount: 0,
        lastMove: null
    };
}

// --- Socket.IO Connection Handler ---
io.on('connection', (socket) => {
    let currentRoomId = null;
    let playerMarker = null;

    console.log(`User connected: ${socket.id}`);

    // --- Utility Function to Emit Current Room State ---
    const emitRoomState = (roomId) => {
        if (rooms[roomId]) {
            io.to(roomId).emit('gameState', {
                roomId: roomId,
                board: rooms[roomId].board,
                turn: rooms[roomId].turn,
                winner: rooms[roomId].winner,
                winLine: rooms[roomId].winLine,
                isStarted: rooms[roomId].isStarted,
                playerCount: rooms[roomId].playerCount,
                waitingForOpponent: rooms[roomId].waitingForOpponent,
                playerXId: Object.keys(rooms[roomId].players).find(id => rooms[roomId].players[id] === 'X'),
                playerOId: Object.keys(rooms[roomId].players).find(id => rooms[roomId].players[id] === 'O'),
                lastMove: rooms[roomId].lastMove
            });
            console.log(`[${roomId}] State Emitted. Players: ${rooms[roomId].playerCount}, Started: ${rooms[roomId].isStarted}`);
        }
    };

    // --- Matchmaking: Quick Match ---
    socket.on('quickMatch', () => {
        // 1. Check for an existing room waiting for one player
        const waitingRoomId = Object.keys(rooms).find(id => 
            rooms[id].playerCount === 1 && rooms[id].waitingForOpponent
        );

        if (waitingRoomId) {
            // Found a waiting room, join it
            joinRoom(waitingRoomId);
        } else {
            // No waiting room, create a new one
            createRoom(true);
        }
    });

    // --- Room Creation for Invite Link ---
    socket.on('createRoom', () => {
        createRoom(false); // Not a quick match, explicit invite
    });

    // --- Room Join Logic ---
    const joinRoom = (roomId) => {
        if (!rooms[roomId]) {
            socket.emit('error', 'Room not found.');
            return;
        }

        const room = rooms[roomId];

        if (room.playerCount >= 2) {
            // Spectator mode is Out of Scope for MVP, so we treat 2 as max.
            socket.emit('error', 'Room is full. Cannot join.');
            return;
        }

        // Leave any previous room
        if (currentRoomId) {
            socket.leave(currentRoomId);
            currentRoomId = null;
        }

        // 1. Join the socket.io room
        socket.join(roomId);
        currentRoomId = roomId;
        room.playerCount++;

        // 2. Assign Marker (The player who joins second is always the remaining marker)
        const existingMarker = Object.values(room.players)[0];
        playerMarker = existingMarker === 'X' ? 'O' : 'X';
        room.players[socket.id] = playerMarker;

        // 3. Update room state (no longer waiting)
        room.waitingForOpponent = false;
        room.isStarted = true;

        socket.emit('joinedRoom', { roomId, marker: playerMarker });
        emitRoomState(roomId);
    };

    // Internal function to handle room creation
    const createRoom = (isQuickMatch) => {
        let roomId = generateRoomId();
        while (rooms[roomId]) {
            roomId = generateRoomId(); // Ensure unique ID
        }

        // Leave any previous room
        if (currentRoomId) {
            socket.leave(currentRoomId);
            currentRoomId = null;
        }

        rooms[roomId] = initializeGameState();
        
        // 1. Join the socket.io room
        socket.join(roomId);
        currentRoomId = roomId;
        
        // 2. Assign Marker (First player is always X)
        playerMarker = 'X';
        rooms[roomId].players[socket.id] = playerMarker;
        rooms[roomId].playerCount++;

        socket.emit('joinedRoom', { roomId, marker: playerMarker });
        emitRoomState(roomId);
    };

    // --- Client requests to join by ID (Invite Link) ---
    socket.on('joinRoomById', (roomId) => {
        joinRoom(roomId.toUpperCase()); // Convert to ensure case-insensitivity consistency
    });


    // --- Core Game Logic: Make Move ---
    socket.on('makeMove', (index) => {
        const room = rooms[currentRoomId];

        if (!room || !room.isStarted || room.winner || room.playerCount !== 2) {
            // Game not ready or already over
            return;
        }

        // 1. Check if it's the player's turn and the cell is empty
        if (room.turn === playerMarker && room.board[index] === null) {
            // 2. Update board state
            room.board[index] = playerMarker;
            room.lastMove = index;

            // 3. Check for win
            const win = checkWin(room.board);
            if (win) {
                room.winner = playerMarker;
                room.winLine = win.line;
            } else if (checkDraw(room.board)) {
                // 4. Check for draw
                room.winner = 'Draw';
            } else {
                // 5. Change turn
                room.turn = playerMarker === 'X' ? 'O' : 'X';
            }

            // 6. Broadcast the new state to the room
            emitRoomState(currentRoomId);
        } else {
            // Invalid move attempt
            socket.emit('error', 'Invalid move: Not your turn or cell occupied.');
        }
    });

    // --- Play Again / Rematch ---
    socket.on('playAgain', () => {
        const room = rooms[currentRoomId];
        if (!room || room.playerCount !== 2) return;

        console.log(`[${currentRoomId}] Rematch requested.`);

        // Reset game state, but keep players
        room.board = Array(9).fill(null);
        room.winner = null;
        room.winLine = null;
        room.lastMove = null;

        // The loser of the previous round starts the next one (simple alternating start)
        // If there was a draw, the player who was 'O' in the previous game goes first (X)
        const nextStarter = room.turn === 'X' ? 'O' : 'X';
        room.turn = nextStarter;

        // Emit reset confirmation to both players (optional, but good for UI sync)
        io.to(currentRoomId).emit('rematchStarted');

        // Broadcast the new, reset state
        emitRoomState(currentRoomId);
    });

    // --- Leave Room ---
    const leaveRoomCleanup = () => {
        if (currentRoomId && rooms[currentRoomId]) {
            console.log(`User ${socket.id} (${playerMarker}) is leaving room ${currentRoomId}.`);
            
            socket.leave(currentRoomId);
            rooms[currentRoomId].playerCount--;
            delete rooms[currentRoomId].players[socket.id];

            if (rooms[currentRoomId].playerCount === 0) {
                // If the room is empty, delete it
                console.log(`[${currentRoomId}] Room empty, deleting.`);
                delete rooms[currentRoomId];
            } else {
                // Notify the remaining player that the opponent has left
                rooms[currentRoomId].isStarted = false;
                rooms[currentRoomId].waitingForOpponent = true;
                rooms[currentRoomId].winner = 'Opponent Left'; // Custom status
                emitRoomState(currentRoomId);
            }
            currentRoomId = null;
            playerMarker = null;
        }
    };

    socket.on('leaveRoom', leaveRoomCleanup);

    // --- Disconnect Handler (Crucial for handling browser close/network drop) ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Handle cleanup, identical to leaving the room
        leaveRoomCleanup(); 
    });
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
// Simple endpoint for health check (not strictly needed for Socket.IO but good practice)
app.get('/', (req, res) => {
    res.send('Multiplayer Tic-Tac-Toe Server is Running!');
});
