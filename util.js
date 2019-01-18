
function generateNewRoomId() {
	return Math.floor(Math.random() * 999999);
}

function generateNewCardId() {
	return Math.floor(Math.random() * 9999);
}

function shuffle(a) {
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}


function similarity(s1, s2) {
	let longer = s1;
	let shorter = s2;
	if (s1.length < s2.length) {
		longer = s2;
		shorter = s1;
	}
	const longerLength = longer.length;
	if (longerLength === 0) {
		return 1.0;
	}
	return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength);
}

function editDistance(s1, s2) {
	s1 = s1.toLowerCase();
	s2 = s2.toLowerCase();

	const costs = [];
	for (let i = 0; i <= s1.length; i++) {
		let lastValue = i;
		for (let j = 0; j <= s2.length; j++) {
			if (i === 0)
				costs[j] = j;
			else {
				if (j > 0) {
					let newValue = costs[j - 1];
					if (s1.charAt(i - 1) !== s2.charAt(j - 1))
						newValue = Math.min(Math.min(newValue, lastValue),
							costs[j]) + 1;
					costs[j - 1] = lastValue;
					lastValue = newValue;
				}
			}
		}
		if (i > 0)
			costs[s2.length] = lastValue;
	}
	return costs[s2.length];
}
function parseGameForFrontend(game) {
	let users = [];
	for (let user in game.users) {
		users.push({
			nick: game.users[user].nick,
			points: game.users[user].points,
			host: game.users[user].host,
			role: game.users[user].role
		});
	}
	return {
		code: game.code,
		state: game.state,
		users: users,
		card: game.card,
		responses: game.responses
	}
}
module.exports = {
	generateNewRoomId,
	generateNewCardId,
	parseGameForFrontend,
	similarity,
	shuffle
};
