const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const Hand = require('pokersolver').Hand;

app.use(express.static('public'));

// Game state management
const games = new Map();

function createGame() {
    const gameId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const gameState = {
        id: gameId,
        deck: [],
        exposedCard: null,
        players: {},
        piles: {
            player1: Array(5).fill([]),
            player2: Array(5).fill([])
        },
        currentTurn: null,
        gameStarted: false,
        gameOver: false
    };
    games.set(gameId, gameState);
    return gameId;
}

function removeGame(gameId) {
    games.delete(gameId);
}

function getActiveGames() {
    const activeGames = [];
    for (const [id, game] of games) {
        activeGames.push({
            id: id,
            players: Object.keys(game.players).length,
            started: game.gameStarted
        });
    }
    return activeGames;
}

function createDeck() {
    const suits = ['h', 'd', 'c', 's'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const deck = [];
    
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

function startGame(gameId) {
    const game = games.get(gameId);
    if (!game) return;

    game.deck = createDeck();
    game.gameStarted = true;
    game.currentTurn = 'player1';
    
    // Deal initial hands
    Object.keys(game.players).forEach(player => {
        game.players[player].hand = game.deck.splice(0, 5);
    });
    
    return game;
}

function evaluateGame(gameState) {
    const results = {
        player1: { wins: 0 },
        player2: { wins: 0 },
        pileResults: []
    };
    
    // Compare each pile
    for (let i = 0; i < 5; i++) {
        const p1Cards = gameState.piles.player1[i];
        const p2Cards = gameState.piles.player2[i];
        
        if (!p1Cards.length || !p2Cards.length) continue;
        
        const p1Hand = Hand.solve(p1Cards);
        const p2Hand = Hand.solve(p2Cards);
        const winner = Hand.winners([p1Hand, p2Hand]);
        
        const pileResult = {
            p1Hand: p1Hand.descr,
            p2Hand: p2Hand.descr,
            winner: winner[0] === p1Hand ? 'player1' : 
                   winner[0] === p2Hand ? 'player2' : 'tie'
        };
        
        if (pileResult.winner === 'player1') results.player1.wins++;
        else if (pileResult.winner === 'player2') results.player2.wins++;
        
        results.pileResults.push(pileResult);
    }
    
    // Determine overall winner
    results.winner = results.player1.wins > results.player2.wins ? 'player1' :
                    results.player2.wins > results.player1.wins ? 'player2' : 'tie';
    
    return results;
}

io.on('connection', (socket) => {
    console.log('User connected');
    
    // Send list of active games to new connection
    socket.emit('gamesList', getActiveGames());
    
    socket.on('createGame', () => {
        const gameId = createGame();
        socket.emit('gameCreated', gameId);
        io.emit('gamesList', getActiveGames());
    });
    
    socket.on('joinGame', ({ gameId, role }) => {
        const game = games.get(gameId);
        if (!game) {
            socket.emit('error', 'Game not found');
            return;
        }
        
        if (game.players[role]) {
            socket.emit('error', 'Role already taken');
            return;
        }
        
        // Leave current game if in one
        if (socket.gameId) {
            const currentGame = games.get(socket.gameId);
            if (currentGame) {
                Object.keys(currentGame.players).forEach(playerRole => {
                    if (currentGame.players[playerRole].id === socket.id) {
                        delete currentGame.players[playerRole];
                    }
                });
                
                if (Object.keys(currentGame.players).length === 0) {
                    removeGame(socket.gameId);
                }
                
                io.emit('gamesList', getActiveGames());
            }
        }
        
        // Join new game
        game.players[role] = { id: socket.id, hand: [] };
        socket.gameId = gameId;
        socket.join(gameId);
        socket.emit('joined', { gameId, role });
        io.to(gameId).emit('playerJoined', { role });
        io.emit('gamesList', getActiveGames());
        
        // Start game if both players joined
        if (Object.keys(game.players).length === 2 && !game.gameStarted) {
            const updatedGame = startGame(gameId);
            io.to(gameId).emit('gameStarted', updatedGame);
        }
    });
    
    socket.on('drawCard', ({ gameId, source, player }) => {
        const game = games.get(gameId);
        if (!game || game.currentTurn !== player) return;
        
        let card;
        if (source === 'deck' && game.deck.length > 0) {
            card = game.deck.pop();
        } else if (source === 'exposed' && game.exposedCard) {
            card = game.exposedCard;
            game.exposedCard = null;
        }
        
        if (card) {
            game.players[player].hand.push(card);
            io.to(gameId).emit('gameStateUpdate', game);
        }
    });
    
    socket.on('playCard', ({ gameId, player, card, pileIndex }) => {
        const game = games.get(gameId);
        if (!game || game.currentTurn !== player) return;
        
        const hand = game.players[player].hand;
        const cardIndex = hand.indexOf(card);
        
        if (cardIndex === -1) return;
        
        // Remove card from hand
        hand.splice(cardIndex, 1);
        
        // Add card to pile
        const piles = player === 'player1' ? game.piles.player1 : game.piles.player2;
        if (!Array.isArray(piles[pileIndex])) {
            piles[pileIndex] = [];
        }
        piles[pileIndex].push(card);
        
        // Add to exposed if not coming from exposed
        if (card !== game.exposedCard) {
            game.exposedCard = game.deck.pop();
        }
        
        // Switch turns
        game.currentTurn = game.currentTurn === 'player1' ? 'player2' : 'player1';
        
        // Check if game is over
        const allPilesFull = Object.values(game.piles).every(playerPiles =>
            playerPiles.every(pile => pile.length === 5)
        );
        
        if (allPilesFull || game.deck.length === 0) {
            game.gameOver = true;
            const results = evaluateGame(game);
            io.to(gameId).emit('gameOver', results);
            
            // Clean up game after delay
            setTimeout(() => {
                removeGame(gameId);
                io.emit('gamesList', getActiveGames());
            }, 5000);
        } else {
            io.to(gameId).emit('gameStateUpdate', game);
        }
    });
    
    socket.on('leaveGame', () => {
        if (socket.gameId) {
            const game = games.get(socket.gameId);
            if (game) {
                Object.keys(game.players).forEach(role => {
                    if (game.players[role].id === socket.id) {
                        delete game.players[role];
                    }
                });
                
                if (Object.keys(game.players).length === 0) {
                    removeGame(socket.gameId);
                }
                
                socket.leave(socket.gameId);
                delete socket.gameId;
                io.emit('gamesList', getActiveGames());
            }
        }
    });
    
    socket.on('disconnect', () => {
        if (socket.gameId) {
            const game = games.get(socket.gameId);
            if (game) {
                Object.keys(game.players).forEach(role => {
                    if (game.players[role].id === socket.id) {
                        delete game.players[role];
                    }
                });
                
                if (Object.keys(game.players).length === 0) {
                    removeGame(socket.gameId);
                } else {
                    io.to(socket.gameId).emit('playerLeft');
                }
                
                io.emit('gamesList', getActiveGames());
            }
        }
    });
});

const port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
