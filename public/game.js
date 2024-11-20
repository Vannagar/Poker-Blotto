const socket = io();

let playerRole = null;
let currentGameId = null;
let selectedCard = null;

// DOM Elements
const gameListView = document.getElementById('game-list-view');
const gamesList = document.getElementById('games-list');
const createGameButton = document.getElementById('create-game');
const gameBoard = document.getElementById('game-board');
const gameIdDisplay = document.getElementById('game-id');
const leaveGameButton = document.getElementById('leave-game');
const gameStatus = document.getElementById('game-status');
const playerHand = document.getElementById('player-hand');
const opponentHand = document.getElementById('opponent-hand');
const playerPiles = document.getElementById('player-piles');
const opponentPiles = document.getElementById('opponent-piles');
const deck = document.getElementById('deck');
const exposedCard = document.getElementById('exposed-card');

// Event Listeners
createGameButton.addEventListener('click', () => {
    socket.emit('createGame');
});

leaveGameButton.addEventListener('click', () => {
    socket.emit('leaveGame');
    showGameList();
});

deck.addEventListener('click', () => {
    if (currentGameId) {
        socket.emit('drawCard', { gameId: currentGameId, source: 'deck', player: playerRole });
    }
});

exposedCard.addEventListener('click', () => {
    if (currentGameId) {
        socket.emit('drawCard', { gameId: currentGameId, source: 'exposed', player: playerRole });
    }
});

function showGameList() {
    gameListView.style.display = 'block';
    gameBoard.style.display = 'none';
    playerRole = null;
    currentGameId = null;
    selectedCard = null;
}

function showGameBoard() {
    gameListView.style.display = 'none';
    gameBoard.style.display = 'flex';
}

function updateGamesList(games) {
    gamesList.innerHTML = '';
    games.forEach(game => {
        const gameItem = document.createElement('div');
        gameItem.className = 'game-item';
        
        const gameInfo = document.createElement('div');
        gameInfo.className = 'game-info';
        gameInfo.innerHTML = `
            <h3>Game ${game.id}</h3>
            <p>Players: ${game.players}/2</p>
            <p>Status: ${game.started ? 'In Progress' : 'Waiting'}</p>
        `;
        
        const gameActions = document.createElement('div');
        gameActions.className = 'game-actions';
        
        if (!game.started) {
            const joinAsPlayer1 = document.createElement('button');
            joinAsPlayer1.textContent = 'Join as Player 1';
            joinAsPlayer1.disabled = game.players > 1;
            joinAsPlayer1.onclick = () => joinGame(game.id, 'player1');
            
            const joinAsPlayer2 = document.createElement('button');
            joinAsPlayer2.textContent = 'Join as Player 2';
            joinAsPlayer2.disabled = game.players > 1;
            joinAsPlayer2.onclick = () => joinGame(game.id, 'player2');
            
            gameActions.appendChild(joinAsPlayer1);
            gameActions.appendChild(joinAsPlayer2);
        }
        
        gameItem.appendChild(gameInfo);
        gameItem.appendChild(gameActions);
        gamesList.appendChild(gameItem);
    });
}

function joinGame(gameId, role) {
    socket.emit('joinGame', { gameId, role });
}

function createCard(card) {
    const cardElement = document.createElement('div');
    cardElement.className = 'card';
    if (card.suit === '♥' || card.suit === '♦') {
        cardElement.classList.add('red');
    }
    cardElement.textContent = formatCard(card);
    return cardElement;
}

function formatCard(card) {
    const value = card.value;
    const suit = card.suit;
    
    return `${value}${suit}`;
}

function updateGameState(gameState) {
    gameIdDisplay.textContent = `Game ${gameState.id}`;
    
    // Update hands
    playerHand.innerHTML = '';
    opponentHand.innerHTML = '';
    
    const hand = gameState.players[playerRole].hand;
    hand.forEach(card => {
        const cardElement = createCard(card);
        cardElement.addEventListener('click', () => selectCard(cardElement, card));
        playerHand.appendChild(cardElement);
    });
    
    const opponentRole = playerRole === 'player1' ? 'player2' : 'player1';
    const opponentHandSize = gameState.players[opponentRole].hand.length;
    for (let i = 0; i < opponentHandSize; i++) {
        const cardBack = document.createElement('div');
        cardBack.className = 'card';
        cardBack.textContent = '🂠';
        opponentHand.appendChild(cardBack);
    }
    
    // Update piles
    playerPiles.innerHTML = '';
    opponentPiles.innerHTML = '';
    
    for (let i = 0; i < 5; i++) {
        const playerPile = document.createElement('div');
        playerPile.className = 'pile';
        playerPile.setAttribute('data-pile-number', i + 1);
        playerPile.addEventListener('click', () => playCard(i));
        
        const opponentPile = document.createElement('div');
        opponentPile.className = 'pile';
        opponentPile.setAttribute('data-pile-number', i + 1);
        
        const playerPileCards = gameState.piles[playerRole][i] || [];
        const opponentPileCards = gameState.piles[opponentRole][i] || [];
        
        playerPileCards.forEach(card => {
            playerPile.appendChild(createCard(card));
        });
        
        opponentPileCards.forEach(card => {
            opponentPile.appendChild(createCard(card));
        });
        
        playerPiles.appendChild(playerPile);
        opponentPiles.appendChild(opponentPile);
    }
    
    // Update exposed card
    if (gameState.exposedCard) {
        const exposedCardElement = createCard(gameState.exposedCard);
        exposedCard.innerHTML = '';
        exposedCard.appendChild(exposedCardElement);
    } else {
        exposedCard.textContent = 'No Card';
    }
    
    // Update deck
    deck.textContent = gameState.deck.length > 0 ? '🂠' : 'Empty';
    
    // Update turn status
    const isMyTurn = gameState.currentTurn === playerRole;
    gameStatus.textContent = isMyTurn ? 'Your turn' : "Opponent's turn";
}

function selectCard(cardElement, card) {
    if (!currentGameId || gameState.currentTurn !== playerRole) return;
    
    if (selectedCard) {
        selectedCard.element.classList.remove('selected');
    }
    
    if (selectedCard && selectedCard.element === cardElement) {
        selectedCard = null;
    } else {
        cardElement.classList.add('selected');
        selectedCard = { element: cardElement, card: card };
    }
}

function playCard(pileIndex) {
    if (!currentGameId || !selectedCard || gameState.currentTurn !== playerRole) return;
    
    socket.emit('playCard', {
        gameId: currentGameId,
        player: playerRole,
        card: selectedCard.card,
        pileIndex: pileIndex
    });
    
    selectedCard.element.classList.remove('selected');
    selectedCard = null;
}

// Socket event handlers
socket.on('gamesList', updateGamesList);

socket.on('gameCreated', (gameId) => {
    joinGame(gameId, 'player1');
});

socket.on('joined', ({ gameId, role }) => {
    currentGameId = gameId;
    playerRole = role;
    showGameBoard();
});

socket.on('gameStateUpdate', updateGameState);

socket.on('gameOver', (results) => {
    const resultsDisplay = document.createElement('div');
    resultsDisplay.className = 'results-display';
    
    let resultsHTML = '<div class="results-header">';
    if (results.winner === playerRole) {
        resultsHTML += '<h2>🎉 You Won! 🎉</h2>';
    } else if (results.winner === 'tie') {
        resultsHTML += '<h2>🤝 It\'s a Tie! 🤝</h2>';
    } else {
        resultsHTML += '<h2>Better luck next time!</h2>';
    }
    
    resultsHTML += '<table class="results-table"><thead><tr>' +
                  '<th>Pile</th><th>Your Hand</th><th>Opponent\'s Hand</th><th>Winner</th>' +
                  '</tr></thead><tbody>';
    
    results.pileResults.forEach((result, index) => {
        const yourHand = playerRole === 'player1' ? result.p1Hand : result.p2Hand;
        const opponentHand = playerRole === 'player1' ? result.p2Hand : result.p1Hand;
        const pileWinner = result.winner === playerRole ? 'You' :
                          result.winner === 'tie' ? 'Tie' : 'Opponent';
        const winnerClass = result.winner === playerRole ? 'winner-you' :
                           result.winner === 'tie' ? 'winner-tie' : 'winner-opponent';
        
        resultsHTML += `<tr>
            <td>Pile ${index + 1}</td>
            <td>${yourHand}</td>
            <td>${opponentHand}</td>
            <td class="${winnerClass}">${pileWinner}</td>
        </tr>`;
    });
    
    resultsHTML += '</tbody></table>';
    resultsHTML += '<button onclick="showGameList()" class="play-again-btn">Back to Games List</button>';
    
    resultsDisplay.innerHTML = resultsHTML;
    gameBoard.innerHTML = '';
    gameBoard.appendChild(resultsDisplay);
});

socket.on('playerLeft', () => {
    gameStatus.textContent = 'Opponent left the game';
    setTimeout(showGameList, 3000);
});

socket.on('error', (error) => {
    console.error('Game error:', error);
    gameStatus.textContent = `Error: ${error}`;
});
