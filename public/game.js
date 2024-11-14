const socket = io();

let playerRole = null;
let gameState = {
    currentTurn: null,
    hasDrawnCard: false,
    deckEmpty: false
};
let selectedCard = null;

// UI Elements
const joinControls = document.getElementById('join-controls');
const gameBoard = document.getElementById('game-board');
const gameStatus = document.getElementById('game-status');
const playerHand = document.getElementById('player-hand');
const opponentHand = document.getElementById('opponent-hand');
const playerPiles = document.getElementById('player-piles');
const opponentPiles = document.getElementById('opponent-piles');
const deck = document.getElementById('deck');
const exposedCard = document.getElementById('exposed-card');

// Join buttons
document.getElementById('join-player1').addEventListener('click', () => joinGame('player1'));
document.getElementById('join-player2').addEventListener('click', () => joinGame('player2'));
document.getElementById('join-spectator').addEventListener('click', () => joinGame('spectator'));

function joinGame(role) {
    socket.emit('joinGame', role);
}

// Socket event handlers
socket.on('joined', (role) => {
    playerRole = role;
    joinControls.style.display = 'none';
    gameBoard.style.display = 'flex';
    gameStatus.textContent = 'Waiting for opponent...';
});

socket.on('playerJoined', ({ role }) => {
    if (playerRole && playerRole !== role) {
        gameStatus.textContent = 'Both players joined! Game starting...';
    }
});

socket.on('gameStarted', (state) => {
    gameState = state;
    updateGameDisplay();
    if (state.currentTurn === playerRole) {
        gameStatus.textContent = 'Your turn! Draw a card.';
    } else {
        gameStatus.textContent = "Opponent's turn";
    }
});

socket.on('gameStateUpdate', (newState) => {
    gameState = newState;
    updateGameDisplay();
});

socket.on('gameOver', (results) => {
    const gameBoard = document.getElementById('game-board');
    const resultsDisplay = document.createElement('div');
    resultsDisplay.id = 'game-results';
    resultsDisplay.className = 'results-display';
    
    // Create results HTML
    let resultsHTML = '<div class="results-header">';
    if (results.winner === playerRole) {
        resultsHTML += '<h2>🎉 You Won! 🎉</h2>';
    } else if (results.winner === 'tie') {
        resultsHTML += '<h2>🤝 It\'s a Tie! 🤝</h2>';
    } else {
        resultsHTML += '<h2>Better luck next time!</h2>';
    }
    resultsHTML += `<p>Score: You ${results[playerRole].wins} - ${results[getOpponentRole()].wins} Opponent</p></div>`;
    
    // Add detailed hand comparison table
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
    resultsHTML += '<button onclick="location.reload()" class="play-again-btn">Play Again</button>';
    
    resultsDisplay.innerHTML = resultsHTML;
    gameBoard.innerHTML = '';
    gameBoard.appendChild(resultsDisplay);
    
    // Add styles for the results display
    const style = document.createElement('style');
    style.textContent = `
        .results-display {
            background: rgba(0, 0, 0, 0.8);
            padding: 20px;
            border-radius: 10px;
            color: white;
            text-align: center;
            max-width: 800px;
            margin: 0 auto;
        }
        
        .results-header {
            margin-bottom: 20px;
        }
        
        .results-header h2 {
            font-size: 24px;
            margin-bottom: 10px;
        }
        
        .results-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 5px;
        }
        
        .results-table th,
        .results-table td {
            padding: 10px;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        
        .results-table th {
            background: rgba(255, 255, 255, 0.1);
        }
        
        .winner-you {
            color: #4CAF50;
            font-weight: bold;
        }
        
        .winner-opponent {
            color: #f44336;
        }
        
        .winner-tie {
            color: #FFC107;
        }
        
        .play-again-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 20px;
        }
        
        .play-again-btn:hover {
            background: #45a049;
        }
    `;
    document.head.appendChild(style);
});

function getOpponentRole() {
    return playerRole === 'player1' ? 'player2' : 'player1';
}

// Game UI update functions
function updateGameDisplay() {
    const isPlayerTurn = gameState.currentTurn === playerRole;
    const statusMessages = {
        notYourTurn: "Waiting for opponent's move...",
        needToDraw: "Your turn - Draw a card first",
        canPlay: "Your turn - Place a card",
        deckEmpty: "Your turn - Place a card (Deck empty)"
    };

    let statusMessage;
    if (!isPlayerTurn) {
        statusMessage = statusMessages.notYourTurn;
    } else if (!gameState.hasDrawnCard && !gameState.deckEmpty) {
        statusMessage = statusMessages.needToDraw;
    } else {
        statusMessage = gameState.deckEmpty ? statusMessages.deckEmpty : statusMessages.canPlay;
    }
    
    document.getElementById('game-status').textContent = statusMessage;
    
    // Update UI elements
    updateHand();
    updatePiles();
    updateDeck();
}

function updateHand() {
    playerHand.innerHTML = '';
    opponentHand.innerHTML = '';
    
    if (playerRole && gameState.players[playerRole]) {
        gameState.players[playerRole].hand.forEach((card, index) => {
            const cardEl = createCardElement(card);
            cardEl.addEventListener('click', () => selectCard(index));
            playerHand.appendChild(cardEl);
        });
    }
    
    const opponentRole = playerRole === 'player1' ? 'player2' : 'player1';
    if (gameState.players[opponentRole]) {
        const numCards = gameState.players[opponentRole].hand.length;
        for (let i = 0; i < numCards; i++) {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.textContent = '🂠';
            opponentHand.appendChild(cardEl);
        }
    }
}

function updatePiles() {
    playerPiles.innerHTML = '';
    opponentPiles.innerHTML = '';
    
    const playerPileCards = playerRole === 'player1' ? gameState.piles.player1 : gameState.piles.player2;
    const opponentPileCards = playerRole === 'player1' ? gameState.piles.player2 : gameState.piles.player1;
    
    for (let i = 0; i < 5; i++) {
        const playerPile = createPileElement(i, playerPileCards[i]);
        const opponentPile = createPileElement(i, opponentPileCards[i], true);
        
        playerPiles.appendChild(playerPile);
        opponentPiles.appendChild(opponentPile);
    }
}

function createPileElement(index, cards, isOpponent = false) {
    const pileEl = document.createElement('div');
    pileEl.className = 'pile';
    
    if (cards && cards.length > 0) {
        cards.forEach((card, cardIndex) => {
            const cardEl = createCardElement(card);
            cardEl.style.zIndex = cardIndex + 1; // Ensure proper stacking order
            pileEl.appendChild(cardEl);
        });
    }
    
    // Only add click listener for player's piles
    if (!isOpponent && canPlayCard()) {
        pileEl.addEventListener('click', () => {
            if (selectedCard !== null && cards.length < 5) {
                socket.emit('playCard', { pileIndex: index, cardIndex: selectedCard });
                selectedCard = null;
            }
        });
    }
    
    return pileEl;
}

function updateDeck() {
    const deck = document.getElementById('deck');
    const exposedCard = document.getElementById('exposed-card');
    
    if (gameState.deckEmpty) {
        deck.style.visibility = 'hidden';
        exposedCard.style.visibility = 'hidden';
    } else {
        deck.style.visibility = 'visible';
        exposedCard.style.visibility = 'visible';
        
        // Clear and update exposed card
        exposedCard.innerHTML = '';
        if (gameState.exposedCard) {
            const cardEl = createCardElement(gameState.exposedCard);
            exposedCard.appendChild(cardEl);
            
            // Add click handler for exposed card
            if (canDrawCard()) {
                cardEl.addEventListener('click', () => {
                    socket.emit('drawCard', 'exposed');
                });
                cardEl.style.cursor = 'pointer';
            }
        } else {
            exposedCard.textContent = 'No Card';
        }
        
        // Add click handler for deck
        if (canDrawCard()) {
            deck.style.cursor = 'pointer';
            deck.onclick = () => socket.emit('drawCard', 'deck');
        } else {
            deck.style.cursor = 'default';
            deck.onclick = null;
        }
    }
}

function canDrawCard() {
    return gameState.currentTurn === playerRole && !gameState.hasDrawnCard && !gameState.deckEmpty;
}

function canPlayCard() {
    return gameState.currentTurn === playerRole && 
           (gameState.hasDrawnCard || gameState.deckEmpty);
}

function selectCard(index) {
    if (gameState.currentTurn !== playerRole) return;
    selectedCard = index;
    updateGameDisplay();
}

function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    if (card[1] === 'h' || card[1] === 'd') cardEl.classList.add('red');
    cardEl.textContent = formatCard(card);
    return cardEl;
}

function formatCard(card) {
    const value = card[0];
    const suit = card[1];
    
    const suits = {
        'h': '♥',
        'd': '♦',
        'c': '♣',
        's': '♠'
    };
    
    return `${value}${suits[suit]}`;
}
