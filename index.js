const WebSocket = require('ws');
const express = require('express');
const Utils = require('./util');

let games = [];

const server = express()
	.use(express.static(__dirname))
	.listen(process.env.PORT || 3420, () => console.log(`Listening on ${process.env.PORT || 3420}`));

const wss = new WebSocket.Server({server});


wss.on('connection', function connection(ws, req) {
	const pathName = req.url;
	let player, game;

	if (pathName.includes("/new")) {
		[player, game] = createGame(pathName.split('/')[2], ws)
	} else {
		[player, game] = connectToGame(pathName, ws);
	}

	ws.on('message', function incoming(message) { // message should contain type and content
		// console.log(`Received: "%s" from room ${game.code}.`, message);
		message = message.trim();
		try {
			message = JSON.parse(message);
		} catch (e) {
			console.log("Message:", message, "error:\n", e);
		}
		if (message.type === 'card') {
			if (!game.newCard(message.content.text, player, message.content.answer)) {
				player.client.send(JSON.stringify({type: 'alert', content: 'You are not the dasher!'}));
				return false
			}
			game.sendUpdate()
		}
		if (message.type === 'response') {
			game.newResponse(message.content.text, player, false);
			game.sendUpdate()

		}
		if (message.type === 'vote') {
			game.selectResponse(message.content.text, player);
			game.sendUpdate()
		}
		if (message.type === 'game_update') {
			game.state = message.content.text;
			game.sendUpdate()
		}

		if (message.type === 'next_round') {
			if (!game.nextRound(player)) {
				player.client.send(JSON.stringify({type: 'alert', content: 'You are not the dasher!'}));
				return false
			}
			game.sendUpdate()
		}
	});
	if (game === false) {
		ws.send(JSON.stringify({type: 'info', content: 'This game may not exist, or is already started.'}));
		ws.close();
	} else {
		game.sendUpdate()
	}
});

function connectToGame(path, ws) {
	const nick = path.split('/')[3];
	const code = path.split('/')[2];

	const game = games.filter(game => game.code === parseInt(code))[0];
	if (!game || game.state !== 'creating') return [false, false];

	if (game.users.filter(user => user.nick === nick).length > 0) return [false, false];
	const player = new Player(decodeURI(nick), ws, false);
	game.newPlayer(player);
	return [player, game]
}

function createGame(nick, ws) {
	const newGame = new Game();
	const player = new Player(nick, ws, true);
	newGame.newPlayer(player);
	newGame.dasher = player;
	games.push(newGame);
	return [player, newGame]
}

class Game {
	constructor() {
		this.code = Utils.generateNewRoomId();
		this.state = 'creating'; // creating, starting, writing, picking, intermission
		this.users = [];
		this.dasher = null;
		this.card = {};
		this.responses = [];
		this.totalVotes = 0;
	}

	newCard(text, player, answer) {
		if (player.nick === this.dasher.nick) {
			this.card = {text: text, answer: answer, id: Utils.generateNewCardId()};
			this.state = 'writing';
			this.newResponse(answer, player, true);
			this.selectResponse(answer, player);
			return true
		} else {
			return false
		}
	}

	newResponse(text, player, answer) {
		const newPlayer = {
			nick: player.nick
		};
		this.responses.push({text: text, player: newPlayer, votes: [], isAnswer: answer});
		if (this.checkAllResponses()) {
			this.responses = Utils.shuffle(this.responses);
			this.state = 'picking'
		}
	}

	selectResponse(text, player) {
		const responses = this.responses.filter(response => response.text.toLowerCase() === text.toLowerCase());
		const newPlayer = {
			nick: player.nick
		};
		for (let i in responses) {
			responses[i].votes.push(newPlayer);
			this.totalVotes++
		}
		player.voted = true;
		if (this.users.filter(user => user.voted === true).length === this.users.length && this.state === 'picking') {
			this.state = 'intermission';
			this.awardPoints();
		}
	}

	awardPoints() {
		if (this.state !== 'intermission') return false;
		for (let i in this.responses) {
			const playerClass = this.users.filter(user => user.nick === this.responses[i].player.nick)[0];
			const responseSimilarity = Utils.similarity(this.responses[i].text.toLowerCase(), this.card.answer.toLowerCase());
			if (playerClass.nick !== this.dasher.nick) {
				if (responseSimilarity >= .80) {
					//response was similar to correct answer
					playerClass.points += 3;
				}

				// award players points for getting votes on their response
				playerClass.points += this.responses[i].votes.length;

			} else {
				if (this.responses[i].isAnswer && this.responses[i].votes.length > 1) {
					for (let k = 1; k < this.responses[i].votes.length; k++) {
						// award points for users guessing the correct answer
						const user = this.users.filter(user => user.nick === this.responses[i].votes[k].nick)[0];
						user.points += 2
					}
				}
				if (this.responses[i].isAnswer && this.responses[i].votes.length === 1) {
					// award points for no one guessing teh correct answer
					this.dasher.points += 3
				}
			}
		}
		this.sendUpdate()
	}

	sendUpdate() {
		const gameData = Utils.parseGameForFrontend(this);
		for (let i in this.users) {
			this.users[i].client.send(JSON.stringify({type: 'game', content: gameData}))
		}
	}

	nextRound(player) {
		if (player.role !== "dasher") return false;
		this.state = 'starting';
		// reset users
		for (let i in this.users) {
			this.users[i].voted = false;
			this.users[i].role = 'player'
		}
		// rotate dasher
		const currentUserIndex = this.users.findIndex(user => user.nick === this.dasher.nick);
		if (currentUserIndex !== this.users.length - 1) {
			this.dasher = this.users[currentUserIndex + 1];
			this.users[currentUserIndex + 1].changeRole('dasher')
		} else {
			this.dasher = this.users[0];
			this.users[0].changeRole('dasher')
		}

		this.card = {};
		this.responses = [];
		this.totalVotes = 0;

		return true
	}

	checkAllResponses() {
		return this.responses.length === this.users.length;
	}

	getAllPoints() {
		let points = [];
		for (let i in this.users) {
			points.push({nick: this.users[i].nick, points: this.users[i].points});
		}
		return points
	}

	newPlayer(player) {
		this.users.push(player)
	}
}

class Player {
	constructor(nick, ws, host) {
		this.nick = nick;
		this.client = ws;
		this.points = 0;
		this.host = host;
		this.voted = false;
		this.role = host ? 'dasher' : 'player'
	}

	changeRole(role) {
		this.role = role;
	}
}
