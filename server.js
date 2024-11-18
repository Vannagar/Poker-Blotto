const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const Hand = require('pokersolver').Hand;

app.use(express.static('public'));

// Game state
let gameState = {
    deck: [],
    exposedCard: null,
    players: {},
    piles: {
        player1: [[], [], [], [], []],
        player2: [[], [], [], [], []]
    },
    currentTurn: null,
    gameStarted: false,
    hasDrawnCard: false,
    deckEmpty: false
};

function initializeDeck() {
    const suits = ['h', 'd', 'c', 's'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    let deck = [];
    
    for (let suit of suits) {
        for (let value of values) {
            deck.push(value + suit);
        }
    }
    
    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
}

function dealInitialCards() {
    if (Object.keys(gameState.players).length !== 2) return false;
    
    // Initialize and shuffle deck
    gameState.deck = initializeDeck();
    
    // Deal 5 cards to each player
    Object.values(gameState.players).forEach(player => {
        player.hand = gameState.deck.splice(0, 5);
    });
    
    // Set initial exposed card
    gameState.exposedCard = gameState.deck.splice(0, 1)[0];
    gameState.currentTurn = Object.keys(gameState.players)[0];
    gameState.gameStarted = true;
    gameState.hasDrawnCard = false;
    gameState.piles = {
        player1: [[], [], [], [], []],
        player2: [[], [], [], [], []]
    };
    
    return true;
}

function evaluateGame() {
    const results = {
        player1: { wins: 0, hands: [] },
        player2: { wins: 0, hands: [] },
        pileResults: [],
        winner: null
    };

    // Evaluate each pair of piles
    for (let i = 0; i < 5; i++) {
        const p1Pile = gameState.piles.player1[i];
        const p2Pile = gameState.piles.player2[i];
        
        // Only evaluate if both piles have cards
        if (p1Pile.length > 0 && p2Pile.length > 0) {
            console.log(p1Pile.map(card => formatCardForSolver(card)), p2Pile.map(card => formatCardForSolver(card)));
            const p1Hand = Hand.solve(p1Pile.map(card => formatCardForSolver(card)));
            const p2Hand = Hand.solve(p2Pile.map(card => formatCardForSolver(card)));
            
            results.player1.hands.push({
                cards: p1Pile,
                description: p1Hand.name,
                strength: p1Hand.rank
            });
            
            results.player2.hands.push({
                cards: p2Pile,
                description: p2Hand.name,
                strength: p2Hand.rank
            });

            const winner = Hand.winners([p1Hand, p2Hand])[0];
            const pileResult = {
                pile: i,
                p1Hand: p1Hand.name,
                p2Hand: p2Hand.name,
                winner: winner === p1Hand ? 'player1' : 
                       winner === p2Hand ? 'player2' : 'tie'
            };
            
            results.pileResults.push(pileResult);
            
            if (winner === p1Hand) {
                results.player1.wins++;
            } else if (winner === p2Hand) {
                results.player2.wins++;
            }
        }
    }

    // Determine overall winner
    if (results.player1.wins > results.player2.wins) {
        results.winner = 'player1';
    } else if (results.player2.wins > results.player1.wins) {
        results.winner = 'player2';
    } else {
        results.winner = 'tie';
    }

    return results;
}

function formatCardForSolver(card) {
    const value = card[0];
    const suit = card[1].toLowerCase();
    
    // Convert face cards to solver format
    const valueMap = {
        'T': '10',
        'J': 'J',
        'Q': 'Q',
        'K': 'K',
        'A': 'A'
    };
    
    const suitMap = {
        'h': 'h',
        'd': 'd',
        'c': 'c',
        's': 's'
    };
    
    return (valueMap[value] || value) + suitMap[suit];
}

io.on('connection', (socket) => {
    socket.on('joinGame', (role) => {
        if (role === 'player1' && !gameState.players.player1) {
            gameState.players.player1 = { id: socket.id, hand: [] };
            socket.emit('joined', 'player1');
            io.emit('playerJoined', { role: 'player1' });
        } else if (role === 'player2' && !gameState.players.player2) {
            gameState.players.player2 = { id: socket.id, hand: [] };
            socket.emit('joined', 'player2');
            io.emit('playerJoined', { role: 'player2' });
        } else if (role === 'spectator') {
            socket.emit('joined', 'spectator');
        }
        
        // Start game when both players have joined
        if (Object.keys(gameState.players).length === 2 && !gameState.gameStarted) {
            setTimeout(() => {
                if (dealInitialCards()) {
                    io.emit('gameStarted', gameState);
                }
            }, 1000); // Add a small delay for better UX
        }
    });

    socket.on('drawCard', (source) => {
        const player = Object.entries(gameState.players).find(([_, p]) => p.id === socket.id);
        if (!player || player[0] !== gameState.currentTurn || gameState.hasDrawnCard) return;
        
        let drawnCard = null;
        if (source === 'deck' && gameState.deck.length > 0) {
            drawnCard = gameState.deck.pop();
            if (gameState.deck.length === 0 && !gameState.exposedCard) {
                gameState.deckEmpty = true;
            }
        } else if (source === 'exposed' && gameState.exposedCard) {
            drawnCard = gameState.exposedCard;
            gameState.exposedCard = gameState.deck.pop();
            if (gameState.deck.length === 0 && !gameState.exposedCard) {
                gameState.deckEmpty = true;
            }
        }

        if (drawnCard) {
            gameState.players[player[0]].hand.push(drawnCard);
            gameState.hasDrawnCard = true;
            console.log(gameState);
            io.emit('gameStateUpdate', { 
                ...gameState, 
                deckEmpty: gameState.deck.length === 0 && !gameState.exposedCard 
            });
        }
    });

    socket.on('playCard', (data) => {
        const { pileIndex, cardIndex } = data;
        const player = Object.entries(gameState.players).find(([_, p]) => p.id === socket.id);
        if (!player || player[0] !== gameState.currentTurn) return;
        
        // If deck is not empty, require draw phase
        if (!gameState.hasDrawnCard && gameState.deck.length > 0) return;
        
        const playerRole = player[0];
        const playerHand = gameState.players[playerRole].hand;
        const targetPile = gameState.piles[playerRole][pileIndex];

        // Validate the move
        if (cardIndex >= 0 && cardIndex < playerHand.length && targetPile.length < 5) {
            // Remove card from hand and add to pile
            const card = playerHand.splice(cardIndex, 1)[0];
            targetPile.push(card);
            
            // Switch turns and reset hasDrawnCard
            gameState.currentTurn = playerRole === 'player1' ? 'player2' : 'player1';
            gameState.hasDrawnCard = false;
            
            // Check if game is over
            const allPilesFull = Object.values(gameState.piles).every(playerPiles => 
                playerPiles.every(pile => pile.length === 5)
            );
            
            const noMoreCards = gameState.deck.length === 0 && !gameState.exposedCard &&
                              Object.values(gameState.players).every(p => p.hand.length === 0);
            
            if (allPilesFull || noMoreCards) {
                const winner = evaluateGame();
                io.emit('gameOver', winner);
                // Reset game state
                gameState = {
                    deck: [],
                    exposedCard: null,
                    players: {},
                    piles: {
                        player1: [[], [], [], [], []],
                        player2: [[], [], [], [], []]
                    },
                    currentTurn: null,
                    gameStarted: false,
                    hasDrawnCard: false,
                    deckEmpty: false
                };
            } else {
                io.emit('gameStateUpdate', { ...gameState, deckEmpty: gameState.deck.length === 0 && !gameState.exposedCard });
            }
        }
    });

    socket.on('disconnect', () => {
        // Remove player and reset game if a player disconnects
        const playerRole = Object.entries(gameState.players).find(([_, p]) => p.id === socket.id)?.[0];
        if (playerRole) {
            delete gameState.players[playerRole];
            gameState.gameStarted = false;
            io.emit('playerDisconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
