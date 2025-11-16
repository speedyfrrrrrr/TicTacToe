// Connect to backend server - use environment variable or default to same origin
// For GitHub Pages, set this to your Render backend URL: const BACKEND_URL = 'https://your-app.onrender.com';
const BACKEND_URL = window.BACKEND_URL || window.location.origin;
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling']
});

let currentRoomId = null;
let playerName = '';
let gameState = null;

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const playerNameInput = document.getElementById('player-name');
const enterLobbyBtn = document.getElementById('enter-lobby-btn');
const lobbyActions = document.getElementById('lobby-actions');
const createPublicBtn = document.getElementById('create-public-btn');
const createPrivateBtn = document.getElementById('create-private-btn');
const roomCreatedMsg = document.getElementById('room-created-msg');
const roomIdDisplay = document.getElementById('room-id-display');
const copyRoomIdBtn = document.getElementById('copy-room-id');
const roomIdInput = document.getElementById('room-id-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const publicRoomsList = document.getElementById('public-rooms-list');
const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
const leaveGameBtn = document.getElementById('leave-game-btn');
const gameBoard = document.getElementById('game-board');
const gameStatus = document.getElementById('game-status');
const playerXCard = document.getElementById('player-x');
const playerOCard = document.getElementById('player-o');
const roomInfo = document.getElementById('room-info');
const rematchSection = document.getElementById('rematch-section');
const requestRematchBtn = document.getElementById('request-rematch-btn');
const rematchWaiting = document.getElementById('rematch-waiting');
const messageDisplay = document.getElementById('message-display');

// Event Listeners
enterLobbyBtn.addEventListener('click', enterLobby);
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') enterLobby();
});

createPublicBtn.addEventListener('click', () => createRoom(true));
createPrivateBtn.addEventListener('click', () => createRoom(false));
copyRoomIdBtn.addEventListener('click', copyRoomId);
joinRoomBtn.addEventListener('click', joinRoom);
roomIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
});

refreshRoomsBtn.addEventListener('click', () => {
    if (playerName) {
        socket.emit('join-lobby', playerName);
    }
});

leaveGameBtn.addEventListener('click', leaveRoom);
requestRematchBtn.addEventListener('click', requestRematch);

// Initialize game board
function initGameBoard() {
    gameBoard.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.addEventListener('click', () => makeMove(i));
        gameBoard.appendChild(cell);
    }
}

// Functions
function enterLobby() {
    const name = playerNameInput.value.trim();
    if (!name) {
        showMessage('Please enter your name', 'error');
        return;
    }

    playerName = name;
    lobbyActions.classList.remove('hidden');
    playerNameInput.disabled = true;
    enterLobbyBtn.disabled = true;
    socket.emit('join-lobby', playerName);
}

function createRoom(isPublic) {
    if (!playerName) {
        showMessage('Please enter your name first', 'error');
        return;
    }

    socket.emit('create-room', { isPublic, playerName });
}

function joinRoom() {
    const roomId = roomIdInput.value.trim().toUpperCase();
    if (!roomId) {
        showMessage('Please enter a room ID', 'error');
        return;
    }

    if (!playerName) {
        showMessage('Please enter your name first', 'error');
        return;
    }

    socket.emit('join-room', { roomId, playerName });
}

function leaveRoom() {
    if (currentRoomId) {
        socket.emit('leave-room');
        currentRoomId = null;
        showScreen('lobby');
        roomIdInput.value = '';
        if (playerName) {
            socket.emit('join-lobby', playerName);
        }
    }
}

function makeMove(index) {
    if (!currentRoomId || !gameState) return;
    if (gameState.status !== 'playing') return;

    const currentPlayerSymbol = gameState.players.find(p => p.isCurrentPlayer)?.symbol;
    const myPlayer = gameState.players.find(p => p.name === playerName);
    
    if (!myPlayer || myPlayer.symbol !== currentPlayerSymbol) {
        showMessage('Not your turn!', 'error');
        return;
    }

    socket.emit('make-move', { roomId: currentRoomId, index });
}

function requestRematch() {
    if (!currentRoomId) return;
    socket.emit('request-rematch', { roomId: currentRoomId });
    rematchWaiting.classList.remove('hidden');
    requestRematchBtn.disabled = true;
}

function copyRoomId() {
    const roomId = roomIdDisplay.textContent;
    navigator.clipboard.writeText(roomId).then(() => {
        showMessage('Room ID copied!', 'success');
    });
}

function showScreen(screen) {
    lobbyScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    
    if (screen === 'lobby') {
        lobbyScreen.classList.add('active');
    } else if (screen === 'game') {
        gameScreen.classList.add('active');
    }
}

function showMessage(message, type = 'error') {
    messageDisplay.textContent = message;
    messageDisplay.className = `message-display ${type}`;
    messageDisplay.classList.remove('hidden');

    setTimeout(() => {
        messageDisplay.classList.add('hidden');
    }, 3000);
}

function updateGameBoard() {
    if (!gameState) return;

    const cells = gameBoard.querySelectorAll('.cell');
    cells.forEach((cell, index) => {
        const value = gameState.board[index];
        cell.textContent = value || '';
        cell.disabled = value !== null || gameState.status !== 'playing';
        
        if (value === 'X') {
            cell.classList.add('x');
            cell.classList.remove('o');
        } else if (value === 'O') {
            cell.classList.add('o');
            cell.classList.remove('x');
        } else {
            cell.classList.remove('x', 'o');
        }
    });
}

function updatePlayersDisplay() {
    if (!gameState) return;

    const playerX = gameState.players.find(p => p.symbol === 'X');
    const playerO = gameState.players.find(p => p.symbol === 'O');

    // Update Player X
    if (playerX) {
        playerXCard.querySelector('.player-name').textContent = playerX.name;
        playerXCard.querySelector('.player-status').textContent = 
            playerX.isCurrentPlayer ? 'Your turn' : 'Waiting';
        playerXCard.classList.toggle('active', playerX.isCurrentPlayer);
    } else {
        playerXCard.querySelector('.player-name').textContent = 'Waiting...';
        playerXCard.querySelector('.player-status').textContent = '';
        playerXCard.classList.remove('active');
    }

    // Update Player O
    if (playerO) {
        playerOCard.querySelector('.player-name').textContent = playerO.name;
        playerOCard.querySelector('.player-status').textContent = 
            playerO.isCurrentPlayer ? 'Your turn' : 'Waiting';
        playerOCard.classList.toggle('active', playerO.isCurrentPlayer);
    } else {
        playerOCard.querySelector('.player-name').textContent = 'Waiting...';
        playerOCard.querySelector('.player-status').textContent = '';
        playerOCard.classList.remove('active');
    }
}

function updateGameStatus() {
    if (!gameState) return;

    if (gameState.status === 'waiting') {
        gameStatus.textContent = 'Waiting for opponent...';
        rematchSection.classList.add('hidden');
    } else if (gameState.status === 'playing') {
        const currentPlayer = gameState.players.find(p => p.isCurrentPlayer);
        gameStatus.textContent = currentPlayer 
            ? `${currentPlayer.name}'s turn (${currentPlayer.symbol})`
            : 'Game in progress';
        rematchSection.classList.add('hidden');
    } else if (gameState.status === 'finished') {
        if (gameState.isDraw) {
            gameStatus.textContent = "It's a draw!";
        } else if (gameState.winner) {
            const winner = gameState.players.find(p => p.symbol === gameState.winner);
            gameStatus.textContent = winner 
                ? `${winner.name} wins! (${gameState.winner})`
                : `Player ${gameState.winner} wins!`;
        }
        rematchSection.classList.remove('hidden');
        rematchWaiting.classList.add('hidden');
        requestRematchBtn.disabled = false;
    }
}

function updatePublicRooms(rooms) {
    if (rooms.length === 0) {
        publicRoomsList.innerHTML = '<p class="empty-message">No public games available</p>';
        return;
    }

    publicRoomsList.innerHTML = rooms.map(room => `
        <div class="room-item" onclick="joinPublicRoom('${room.id}')">
            <div class="room-item-info">
                <div class="room-item-id">${room.id}</div>
                <div class="room-item-players">${room.playersCount}/2 players</div>
            </div>
            <button class="btn btn-small btn-primary">Join</button>
        </div>
    `).join('');
}

// Global function for joining public rooms
window.joinPublicRoom = function(roomId) {
    roomIdInput.value = roomId;
    joinRoom();
};

// Socket Event Handlers
socket.on('public-rooms', (rooms) => {
    updatePublicRooms(rooms);
});

socket.on('room-created', ({ roomId, isPublic }) => {
    currentRoomId = roomId;
    roomIdDisplay.textContent = roomId;
    roomCreatedMsg.classList.remove('hidden');
    
    if (!isPublic) {
        showMessage('Private room created! Share the room ID with a friend.', 'info');
    } else {
        showMessage('Public room created! Waiting for players...', 'success');
    }
});

socket.on('room-joined', ({ roomId }) => {
    currentRoomId = roomId;
    roomCreatedMsg.classList.add('hidden');
    roomIdInput.value = '';
    showScreen('game');
    showMessage('Successfully joined room!', 'success');
});

socket.on('game-state', (state) => {
    gameState = state;
    updateGameBoard();
    updatePlayersDisplay();
    updateGameStatus();
    updateRoomInfo();
});

socket.on('error', ({ message }) => {
    showMessage(message, 'error');
});

socket.on('rematch-requested', () => {
    rematchWaiting.classList.remove('hidden');
});

function updateRoomInfo() {
    if (currentRoomId) {
        roomInfo.textContent = `Room: ${currentRoomId}`;
    }
}

// Initialize
initGameBoard();

