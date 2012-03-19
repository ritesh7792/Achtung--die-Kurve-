function GameEngine(audioController) {
	/* game variables */
	this.state = 'new'; // new, lobby, editing, waiting, countdown, playing, watching, ended
	this.rewardNodes = new Array();
	this.crossQueue = new Array();
	this.mapSegments = new Array();
	this.mapTeleports = new Array();
	this.debugSegments = new Array();
	this.players = new Array();
	this.indexToPlayer = new Array(8);
	this.type = null;
	this.connected = false;

	/* canvas related */
	this.canvasContainer = document.getElementById('canvasContainer');
	this.baseCanvas = document.getElementById('baseCanvas');
	this.baseContext = this.baseCanvas.getContext('2d');
	this.initContext(this.baseContext);
	this.canvases = new Array(backupStates.length);
	this.contexts = new Array(backupStates.length);

	for(var i = 0; i < backupStates.length - 1; i++) {
		this.canvases[i] = document.createElement('canvas');
		this.contexts[i] = this.canvases[i].getContext('2d');
		this.initContext(this.contexts[i]);
	}

	this.canvases[backupStates.length - 1] = this.baseCanvas;
	this.contexts[backupStates.length - 1] = this.baseContext;

	/* children */
	this.localPlayer = new Player(this, true);
	this.audioController = new AudioController();
	this.editor = new Editor(this);
	this.canvasPos = new Vector(sidebarWidth, 0);

	/* DOM elements */
	this.playerList = document.getElementById('playerList').lastChild;
	this.gameList = document.getElementById('gameList').lastChild;
	this.chatBar = document.getElementById('chat');
	this.sidebar = document.getElementById('sidebar');
	this.debugBox = document.getElementById('status');
	this.connectButton = document.getElementById('connect');
	this.automatchButton = document.getElementById('automatch');
	this.createButton = document.getElementById('createGame');
	this.leaveButton = document.getElementById('stop');
	this.disconnectButton = document.getElementById('disconnect');
	this.backButton = document.getElementById('back');
	this.startButton = document.getElementById('startGame');
	this.hostContainer = document.getElementById('hostContainer');
	this.addComputerButton = document.getElementById('addComputer');
	this.nonhostContainer = document.getElementById('nonhostContainer');

	/* extra inits */
	this.torus = this.noMapSent = false;
	this.width = this.height = this.countdown = this.velocity = 0;
	this.correctionTick = this.tick = this.tock = this.redraws = 0;
	this.adjustGameTimeMessagesReceived = this.modifiedInputs = 0;
	this.holeSize = this.holeFreq = this.fpsMeasureTick = this.frameCount = 0;
	this.pencilMode = 'off';
	this.turnSpeed = 1.5;
	this.host = this.gameloopTimeout = null;
	this.ping = this.bestSyncPing = this.worstSyncPing = 0;		
	this.serverTimeDifference = this.syncTry = -1;
}

/* this only resets things like canvas, but keeps the player info */
GameEngine.prototype.reset = function() {
	this.correctionTick = 0;
	this.tick = -1;
	this.tock = 0;
	this.redraws = 0;
	this.adjustGameTimeMessagesReceived = 0;
	this.modifiedInputs = 0;

	/* these vars are for fps measuring purposes */
	this.fpsMeasureTick = 0; // start of interval
	this.frameCount = 0;
	this.fps = 0;

	this.crossQueue.length = 0;
	document.getElementById('winAnnouncer').style.display = 'none';
	
	pencil.reset();
	pencilReceiver.reset();
}

GameEngine.prototype.resetPlayers = function() {
	this.players.length = 0;
	this.clearPlayerList();
	this.host = null;
}

GameEngine.prototype.getPlayer = function(playerId) {
	return this.players[playerId];
}

GameEngine.prototype.connect = function(url, name, callback) {
	if('MozWebSocket' in window)
		this.websocket = new MozWebSocket(url, name);
	else if('WebSocket' in window)
		this.websocket = new WebSocket(url, name);
	
	var self = this;
	
	try {
		this.websocket.onopen = function() {
			self.gameMessage('Connected to server');
			self.connected = true;
			self.syncWithServer();
			callback();
		}
		this.websocket.onmessage = function(msg) {
			if(simulatedPing > 0)
				window.setTimeout(function() {self.interpretMsg(msg);}, simulatedPing);
			else
				self.interpretMsg(msg);
		}
		this.websocket.onclose = function() {
			if(self.connected) {
				self.gameMessage('Disconnected from server');
				self.connected = false;
			} else {
				self.gameMessage('Could not connect to server');
			}
			self.setGameState('new');
		}
	} catch(exception) {
		self.gameMessage('Websocket exception! ' + exception.name + ': ' + exception.message);
	}
}

GameEngine.prototype.leaveGame = function() {
	this.sendMsg('leaveGame', {});
	window.clearTimeout(this.gameloopTimeout);
	this.leaveButton.disabled = true;
}

GameEngine.prototype.addComputer = function() {
	this.sendMsg('addComputer', {});
}

/* this function handles user interface changes for state transitions */
GameEngine.prototype.setGameState = function(newState) {
	if(newState == 'new' || this.state == 'new') {
		var display = newState == 'new' ? 'none' : 'block';
		document.getElementById('playerListContainer').style.display = display;
		document.getElementById('gameTitle').style.display = display;
		document.getElementById('chatForm').style.display = display;
	}
	
	if(newState == 'waiting' || newState == 'lobby' || newState == 'new') {
		document.getElementById('gameTitle').className = '';
		document.getElementById('goalDisplay').style.display = 'none';
	}

	this.state = newState;

	switch(newState) {
		case 'lobby':
			setOptionVisibility('disconnect');
			setContentVisibility('gameListContainer');
			this.createButton.disabled = this.automatchButton.disabled = false;
			break;
		case 'editing':
			setContentVisibility('editor');
			break;
		case 'countdown':
			setContentVisibility('gameContainer');
			this.setKickLinksVisibility();
			document.getElementById('gameTitle').className = 'leftSide';
			document.getElementById('goalDisplay').style.display = 'block';
			break;
		case 'waiting':
			setOptionVisibility('stop');
			setContentVisibility('waitContainer');
			this.startButton.disabled = false;
			this.leaveButton.disabled = false;
			break;
		case 'playing':
			setOptionVisibility('stop');
			break;
		case 'ended':
			if(this.setSidebarVisibility(true))
				this.resize();

			this.setKickLinksVisibility();

			if(this.type == 'custom')
				setOptionVisibility('back');
			break;
		case 'new':
			resizeChat();
			setContentVisibility('connectionContainer');
			setOptionVisibility('nothing');
			this.connectButton.disabled = false;
			this.connectButton.innerHTML = 'Connect';
			break;
	}
}

GameEngine.prototype.setSidebarVisibility = function(visible) {
	if(visible == (this.sidebar.classList.contains('visible')))
		return false;

	this.sidebar.classList.toggle('visible');
	document.getElementById('menuButton').innerHTML = visible ? '&lt;' : '&gt;';
	this.canvasPos.x = visible ? sidebarWidth : 0;

	var articles = document.getElementsByTagName('article');
	for(var i = 0; i < articles.length; i++)
		articles[i].classList.toggle('translated');

	return true;
}

GameEngine.prototype.toggleSidebar = function() {
	this.setSidebarVisibility(!this.sidebar.classList.contains('visible'));
	this.resize();
}

GameEngine.prototype.joinGame = function(gameId) {
	this.sendMsg('join', {'id': gameId});
}

GameEngine.prototype.joinLobby = function(player) {
	this.sendMsg('joinLobby', {'playerName': player.playerName});
	player.playerName = escapeString(player.playerName);
}

GameEngine.prototype.updateTitle = function(title) {
	if(this.title != title) {
		this.title = title;
		document.getElementById('gameTitle').innerHTML = this.title;
	}
}

GameEngine.prototype.getCollision = function(x1, y1, x2, y2) {
	var seg = new Segment(x1, y1, x2, y2);
	var cut, mincut = 1;
	var other = null;
	
	for(var i in this.mapTeleports) {
		var t = this.mapTeleports[i];
		if(Math.max(x1, x2) < t.left || Math.min(x1, x2) > t.right || 
			Math.max(y1, y2) < t.top || Math.min(y1, y2) > t.bottom)
			continue;
		cut = segmentCollision(t, seg);
		if(cut != -1 && cut < mincut) {
			mincut = cut;
			other = t;
		}
	}
	
	if(other != null) {
		cut = mincut;
		var colx = (1 - cut) * x1 + cut * x2;
		var coly = (1 - cut) * y1 + cut * y2;
		var r = other.tall ? coly - other.y1 : colx - other.x1;

		return new Collision(true, colx, coly, other.destX + r * other.dx,
		 other.destY + r * other.dy, other.extraAngle);
	}
	
	return null;
}

GameEngine.prototype.getTeleport = function(colorId, a, b, c, d) {
	var vx = b.x - a.x;
	var vy = b.y - a.y;
	var wx = d.x - c.x;
	var wy = d.y - c.y;
	
	var t = new Teleporter(a.x, a.y, b.x, b.y);
	t.tall = Math.abs(vy) > Math.abs(vx);
	t.color = playerColors[colorId];
	t.dx = wx / (t.tall ? vy : vx);
	t.dy = wy / (t.tall ? vy : vx);
	t.extraAngle = getAngle(wx, wy) - getAngle(vx, vy);
	t.destX = c.x;
	t.destY = c.y;
	t.left = Math.min(a.x, b.x);
	t.right = Math.max(a.x, b.x);
	t.top = Math.min(a.y, b.y);
	t.bottom = Math.max(a.y, b.y);

	return t;
}

GameEngine.prototype.parseByteMsg = function(str) {
	var a = str.charCodeAt(0);
	var mode = a & 7;
	
	if(mode == modeJson)
		return false;
	
	if(mode == modeModified) {
		var b = str.charCodeAt(1);
		var c = str.charCodeAt(2);
		var d = str.charCodeAt(3);
		
		var input = (a & (127 - 7)) >> 3;
		input |= b << 4;
		input |= (c & 15) << 11;
		var tickDelta = (c & (16 + 32 + 64)) >> 4;
		tickDelta |= d << 3;

		this.correctionTick = Math.min(this.localPlayer.inputs[input].tick += tickDelta,
		 this.correctionTick);
		
		return true;
	}

	if(mode == modeTickUpdate) {
		var b = str.charCodeAt(1);
		var c = str.charCodeAt(2);
	
		var player = this.indexToPlayer[(a & (8 + 16 + 32)) >> 3];
		var tickDelta = (a & 64) >> 6;
		tickDelta |= (127 & b) << 1;
		tickDelta |= (127 & c) << 8;

		player.lastInputTick += tickDelta;
		return true;
	}
	
	if(mode == modeOther) {
		mode = a;

		switch(mode) {
			case modeSetMap:
				var msg = new ByteMessage(str, 3);
				this.mapSegments.length = 0;
				this.mapTeleports.length = 0;

				while(true) {
					var b = str.charCodeAt(msg.at++);
					if(b == 0)
						break;

					var colorId = b & 31;
					this.mapTeleports.push(this.getTeleport(colorId, msg.readPos(), 
					 msg.readPos(), msg.readPos(), msg.readPos()));
				}

				while(msg.at < msg.data.length) {
					var a1 = msg.readPos();
					var a2 = msg.readPos();
					this.mapSegments.push(new Segment(a1.x, a1.y, a2.x, a2.y));
				}

			return true;
		}
	}
	
	switch(mode) {
		case modePencil:
			var msg = new ByteMessage(str, 1);
			var player = this.indexToPlayer[(a & (8 + 16 + 32)) >> 3];
			pencilReceiver.handleMessage(msg, player);
			return true;
	}
}

GameEngine.prototype.decodeTurn = function(oldTurn, turnChange) {
	if((oldTurn == 0 || oldTurn == 1) && turnChange == 0)
		return -1;

	if((oldTurn == 0 || oldTurn == -1) && turnChange == 1)
		return 1;

	return 0;
}

GameEngine.prototype.parseSteerMsg = function(str) {
	var a = str.charCodeAt(0);
	var b = str.charCodeAt(1);
	
	var index = a & 7;
	var turnChange = (a & 8) >> 3;
	var tickDelta = ((a & (16 + 32 + 64)) >> 4) | (b << 3);
	var player = this.indexToPlayer[index];
	var newTurn = this.decodeTurn(player.lastInputTurn, turnChange);
	var tick = player.lastInputTick += tickDelta;
	player.lastInputTurn = newTurn;

	player.inputs.push(new Turn(newTurn, tick, 0, 0, false));
	
	if(tick <= Math.floor(this.tock))
		this.correctionTick = Math.min(this.correctionTick, tick);
}

GameEngine.prototype.interpretMsg = function(msg) {
	var self = this;

	if(msg.data.length == 2)
		return this.parseSteerMsg(msg.data);
	
	if(this.parseByteMsg(msg.data))
		return;
	
	try {
		var obj = JSON.parse(msg.data);
	}
	catch(ex) {
		self.gameMessage('JSON parse exception!');
	}
	
	if(ultraVerbose && obj.mode != 'segments')
		this.gameMessage('Received data: ' + msg.data);

	switch(obj.mode) {
		case 'acceptUser':
			/* cool, we are accepted. lets adopt the server constants */
			this.localPlayer.id = obj.playerId;
			this.tickLength = obj.tickLength;
			pencil.setParameters(obj);
			if(autoStart)
				this.createGame();
			break;
		case 'kickNotification':
			this.gameMessage('You were kicked from the game');
			break;
		case 'joinedGame':
			this.resetPlayers();
			this.type = obj.type;
			this.setGameState((obj.type == 'lobby') ? 'lobby' : 'waiting');
			this.mapSegments.length = 0;
			this.mapTeleports.length = 0;
			this.noMapSent = true;
			this.indexToPlayer[obj.index] = this.localPlayer;
			this.localPlayer.index = obj.index;
			this.addPlayer(this.localPlayer);

			if(obj.type == 'lobby') {
				this.updateTitle('Lobby');
				var index = window.location.href.indexOf('?game=', 0)

				if(!joinedLink && index != -1) {
					this.joinGame(parseInt(window.location.href.substr(index + 6)));
					joinedLink = true;
				}
			}
			else
				this.nonhostContainer.innerHTML = obj.type == 'custom' ? customGameWaitMessage :
				 autoMatchWaitMessage;

			if(obj.type != 'custom')
				this.setHost(null);
			break;
		case 'gameParameters':
			this.setParams(obj);
			break;				
		case 'newPlayer':
			var newPlayer = new Player(this, false);
			newPlayer.id = obj.playerId;
			this.indexToPlayer[obj.index] = newPlayer;
			newPlayer.index = obj.index;
			newPlayer.playerName = escapeString(obj.playerName);
			this.addPlayer(newPlayer);
			this.audioController.playSound('newPlayer');
			break;
		case 'startGame':
			/* keep displaying old game for a while so ppl can see what happened */
			var nextRoundDelay = obj.startTime - this.serverTimeDifference - this.ping
			 + extraGameStartTimeDifference - Date.now();
			 
			// first back to game lobby for some reset work
			if(this.state == 'ended')
				this.backToGameLobby();
				
			document.getElementById('goalDisplay').innerHTML = 'Goal: ' + obj.goal + ' points';

			if(nextRoundDelay > this.countdown) {
				var self = this;

				this.gameloopTimeout = window.setTimeout(function() {
					self.start(obj.startPositions, obj.startTime);
				}, nextRoundDelay - this.countdown);
			}
			else
				this.start(obj.startPositions, obj.startTime);
			break;
		case 'adjustGameTime':
			if(acceptGameTimeAdjustments) {
				//this.gameMessage('Adjusted game time by ' + obj.forward + ' msec');
				this.gameStartTimestamp -= obj.forward;
				this.ping += obj.forward;
				this.adjustGameTimeMessagesReceived++;
				this.displayDebugStatus();
			} else
				this.gameMessage('Game time adjustment of ' + obj.forward + ' msec rejected');
			break;
		case 'playerLeft':
			var player = this.getPlayer(obj.playerId);
			
			if(this.state != 'lobby' || obj.reason != 'normal')
				this.gameMessage(player.playerName + ' left the game' +
				 (obj.reason == 'normal' ? '' : ' (' + obj.reason + ')'));

			this.removePlayer(player);
			this.audioController.playSound('playerLeft');
			break;
		case 'playerDied':
			var player = this.getPlayer(obj.playerId);
			player.finalSteer(obj);
			player.status = 'dead';
			player.updateRow();
	
			if(player == this.localPlayer) {
				if(this.pencilMode == 'ondeath') 
					pencil.enable(obj.tick);
				else
					this.setGameState('watching');
				this.audioController.playSound('localDeath');
			}

			this.displayRewards(obj.reward);
			for(var i in this.players) {
				var player = this.players[i];
				if(player.status == 'alive') {
					player.points += obj.reward;
					player.updateRow();
				}
			}

			this.sortPlayerList();		
			break;
		case 'endRound':
			window.clearTimeout(this.gameloopTimeout);
			document.getElementById('inkIndicator').style.display = 'none';
			for(var i = this.maxHiddenRewards; i < this.rewardNodes.length; i++)
				this.canvasContainer.removeChild(this.rewardNodes.pop());
				
			// simulate to finalTick
			this.tock = this.tick = Math.max(this.tick, obj.finalTick);
			this.correctionTick = Math.min(this.correctionTick, obj.finalTick);
			this.revertBackup();
				
			var player = (obj.winnerId != -1) ? this.getPlayer(obj.winnerId) : null;
			var winner = (player != null) ? (player.playerName + ' won') : 'draw!';
			this.setGameState('countdown');
			this.gameMessage('Round ended: ' + winner);
			break;			
		case 'endGame':
			this.setGameState('ended');
			window.clearTimeout(this.gameloopTimeout);
			var winner = this.getPlayer(obj.winnerId);			
			this.gameMessage('Game over: ' + winner.playerName + ' won!');

			var announcement = document.getElementById('winAnnouncer');
			announcement.innerHTML = winner.playerName + ' won!';
			announcement.style.display = 'inline-block';

			if(winner.isLocal)
				this.audioController.playSound('localWin');
			if(jsProfiling)
				console.profileEnd();
			break;
		case 'time':
			this.handleSyncResponse(obj.time);
			break;
		case 'chat':
			this.audioController.playSound('chat');
			this.printChat(this.getPlayer(obj.playerId), obj.message);
			break;
		case 'newGame':
			this.appendGameList(obj);
			break;
		case 'gameList':
			this.buildGameList(obj.games);
			break;
		case 'segments':
			this.handleSegmentsMessage(obj.segments);
			this.debugSegments = this.debugSegments.concat(obj.segments);
			break;
		case 'stopSpamming':
			this.gameMessage('You are flooding the chat. Your latest message has been blocked');
			break;
		case 'setHost':
			this.setHost(this.getPlayer(obj.playerId));
			if(autoStart)
				this.sendStartGame();
			break;
		case 'joinFailed':
			var msg = 'game already started';
			if(obj.reason == 'notFound') msg = 'game not found';
			else if(obj.reason == 'full') msg = 'game is full';
			else if(obj.reason == 'kicked') msg = 'you are banned for another ' + obj.timer + ' milliseconds';

			this.gameMessage('Could not join game: ' + msg);

			if(obj.reason == 'started')
				document.getElementById('game' + obj.id).getElementsByTagName('button')[0].disabled = true;
			else if(obj.reason == 'notFound') {
				var row = document.getElementById('game' + obj.id);

				if(row != null)
					row.parentNode.removeChild(row);

				if(!this.gameList.hasChildNodes())
					document.getElementById('noGames').style.display = 'block';
			}
			break;
		default:
			this.gameMessage('Unknown mode ' + obj.mode + '!');
	}
}

GameEngine.prototype.removePlayer = function(player) {
	delete this.players[player.id];
	
	if(this.state == 'waiting' || this.state == 'lobby' || this.state == 'editing' || player.status == 'left' ||
	 (this.state == 'ended' && player.status == 'ready')) {
		this.playerList.removeChild(player.row);
		resizeChat();
	} else {
		player.id += '_left';
		this.players[player.id] = player;
		player.status = 'left';
		player.updateRow();
	}
}

GameEngine.prototype.setKickLinksVisibility = function() {
	var showLinks = this.host == this.localPlayer &&
	 (this.state == 'waiting' || this.state == 'ended' || this.state == 'editing');
	var kickLinks = this.playerList.getElementsByTagName('a');

	for(var i = 0; i < kickLinks.length; i++)
		kickLinks[i].className = showLinks ? 'close' : 'close hidden';
}

GameEngine.prototype.setHost = function(player) {
	if(this.host != null) {
		this.host.isHost = false;
		if(this.state == 'waiting' || this.state == 'editing') {
			this.host.status = 'ready';
			this.host.updateRow();
		}
	}
	if(player != null) {
		this.host = player;
		this.host.isHost = true;
		if(this.state == 'waiting' || this.state == 'editing') {
			this.host.status = 'host';
			this.host.updateRow();
		}
	} else
		this.host = null;
	
	var localHost = this.host == this.localPlayer;
	
	var hostBlock = localHost ? 'block' : 'none';
	var nonhostBlock = localHost ? 'none' : 'block';
	this.hostContainer.style.display = hostBlock;
	this.nonhostContainer.style.display = nonhostBlock;

	var inputElts = document.getElementById('details').getElementsByTagName('input');
	for(var i = 0; i < inputElts.length; i++)
		inputElts[i].disabled = !localHost;

	this.setKickLinksVisibility();
}

GameEngine.prototype.buildGameList = function(list) {
	var startedGames = new Array();

	while(this.gameList.hasChildNodes())
		this.gameList.removeChild(this.gameList.firstChild);

	document.getElementById('noGames').style.display = 'block';

	for(var i = 0; i < list.length; i++)
		if(startedGamesDisplay != 'below' && list[i].state == 'started')
			startedGames.push(list[i]);
		else
			this.appendGameList(list[i]);

	if(startedGamesDisplay == 'below')
		for(var i = 0; i < startedGames.length; i++)
			this.appendGameList(startedGames[i]);
}

GameEngine.prototype.appendGameList = function(obj) {
	var self = this;
	document.getElementById('noGames').style.display = 'none';

	var row = document.createElement('tr');
	row.id = 'game' + obj.id;

	var node = document.createElement('td');
	node.innerHTML = obj.id;
	row.appendChild(node);

	node = document.createElement('td');
	node.innerHTML = obj.type;
	row.appendChild(node);

	node = document.createElement('td');
	var nameSpan = document.createElement('span');
	nameSpan.innerHTML = obj.host != undefined ? obj.host : '-'; // FIXME: undefined is nooit nice -- fix dit en rest van gevallen
	nameSpan.className = 'noverflow';
	node.appendChild(nameSpan);
	row.appendChild(node);

	node = document.createElement('td');
	node.innerHTML = obj.state;
	row.appendChild(node);

	node = document.createElement('td');
	node.innerHTML = obj.n + "/" + (obj.type == 'custom' ? obj.nmax : obj.nmin);
	row.appendChild(node);

	var button = document.createElement('button');
	button.innerHTML = 'Join';
	button.disabled = (obj.state != 'lobby');
	button.addEventListener('click', function() { self.joinGame(obj.id); });

	node = document.createElement('td');
	node.appendChild(button);
	row.appendChild(node);

	this.gameList.appendChild(row);
}

GameEngine.prototype.printChat = function(player, message) {
	var escaped = escapeString(message);
	var container = document.getElementById('messages');
	var elt = document.createElement('li');
	var nameContainer = document.createElement('span');
	var displayName = player.isLocal ? 'me' : player.playerName;

	nameContainer.innerHTML = displayName;
	nameContainer.className = 'player';
	elt.innerHTML = escaped;
	elt.className = 'chatMessage';
	
	elt.insertBefore(nameContainer, elt.firstChild);
    container.insertBefore(elt, container.firstChild);
}

GameEngine.prototype.gameMessage = function(msg) {
	var container = document.getElementById('messages');
	var elt = document.createElement('li');

	elt.innerHTML = msg;
	elt.className = 'gameMessage';
    container.insertBefore(elt, container.firstChild);
}

GameEngine.prototype.handleSegmentsMessage = function(segments) {
	var ctx = this.baseContext;
	setLineColor(ctx, [0, 0, 0], 1);
	ctx.lineWidth = 1;
	ctx.beginPath();

	for(var i = 0; i < segments.length; i++) {
		var s = segments[i];

		if(s.x1 != s.x2 || s.y1 != s.y2) {
			ctx.moveTo(s.x1, s.y1);
			ctx.lineTo(s.x2, s.y2);
		}
		else if(debugZeroLengthSegs) {
			ctx.moveTo(s.x1, s.y1);
			ctx.arc(s.x1, s.y1, 5, 0, Math.PI * 2, false);
		}
	}

	ctx.stroke();
	ctx.lineWidth = lineWidth;
}

GameEngine.prototype.handleSyncResponse = function(serverTime) {
	if(this.syncTry == -1) {
		this.ping = 0;
		this.bestSyncPing = 9999;
		this.worstSyncPing = 0;
		this.syncTry = 0;
	}

	var ping = (Date.now() - this.syncSendTime) / 2;
	if(ping < this.bestSyncPing) {
		this.bestSyncPing = ping;
		this.serverTimeDifference = (serverTime + ping) - Date.now();
	}

	if(ping > this.worstSyncPing) {
		this.ping += this.worstSyncPing;
		this.worstSyncPing = ping / (syncTries - 1);
	} else
		this.ping += ping / (syncTries - 1);

	if(++this.syncTry < syncTries) {
		var self = this;
		window.setTimeout(function() {self.syncWithServer();}, this.syncTry * syncDelays);
	} else {
		this.gameMessage('Your current ping is ' + this.ping + ' msec');
		if(ultraVerbose)
			this.gameMessage('Synced with maximum error of ' + this.bestSyncPing + ' msec');
		this.syncTry = -1;
	}
}

/* initialises the game */ 
GameEngine.prototype.setParams = function(obj) {
	this.width = obj.w;
	this.height = obj.h;
	this.countdown = obj.countdown;
	this.velocity = obj.v;
	this.turnSpeed = obj.ts;
	this.holeSize = obj.hsize;
	this.holeFreq = obj.hfreq;
	this.pencilMode = obj.pencilmode;
	this.torus = (obj.torus != 0);

	if(this.pencilMode != 'off') {
		pencil.setParameters(obj);
	}
	
	if(this.state == 'editing')
		this.editor.resize();
	
	if(obj.type != 'lobby') {
		document.getElementById('nmin').value = obj.nmin;
		document.getElementById('nmax').value = obj.nmax;
		document.getElementById('width').value = this.width;
		document.getElementById('height').value = this.height;
		document.getElementById('velocity').value = this.velocity;
		document.getElementById('turnSpeed').value = this.turnSpeed;
		document.getElementById('holeSize').value = this.holeSize;
		document.getElementById('holeFreq').value = this.holeFreq;
		document.getElementById('goal').value = obj.goal;
		document.getElementById('torus').checked = this.torus;
		document.getElementById('inkCapacity').value = obj.inkcap;
		document.getElementById('inkRegen').value = obj.inkregen;
		document.getElementById('inkDelay').value = obj.inkdelay;

		setPencilMode(obj.pencilmode);
		this.updateTitle('Game ' + obj.id);

		var url = new String(window.location);
		var hashPos = url.indexOf('?', 0);

		if(hashPos != -1)
			url = url.substr(0, hashPos);
		url += '?game=' + obj.id;

		document.getElementById('friendInviter').innerHTML = 'Invite your friends by' +
		 ' sending them this link: ' + url;
	}
}

GameEngine.prototype.requestGame = function(player, minPlayers, maxPlayers) {
	this.sendMsg('requestGame', {'playerName': player.playerName,
	 'minPlayers': minPlayers, 'maxPlayers': maxPlayers});
	this.automatchButton.disabled = true;
}

GameEngine.prototype.createGame = function() {
	this.sendMsg('createGame', {});
	this.createButton.disabled = true;
}

GameEngine.prototype.sendMsg = function(mode, data) {
	data.mode = mode;
	var str = JSON.stringify(data);
	
	if(simulatedPing > 0) {
		var that = this;
		window.setTimeout(function() {
			that.websocket.send(str);
			if(ultraVerbose)
				this.gameMessage('Sending data: ' + str);
		}, simulatedPing);	
	}
	else{
		this.websocket.send(str);
		if(ultraVerbose)
			this.gameMessage('Sending data: ' + str);
	}
}

GameEngine.prototype.syncWithServer = function() {
	this.syncSendTime = Date.now();
	this.sendMsg('getTime', {});
}

GameEngine.prototype.addPlayer = function(player) {
	player.color = playerColors[player.index];
	player.segColor = getRGBstring(player.color);
	player.holeColor = getRGBAstring(player.color, holeAlpha);
	player.status = 'ready';
	player.points = 0;
	player.isHost = false;
	this.players[player.id] = player;
	this.appendPlayerList(player);

	if(player == this.localPlayer)
		pencil.updateColor();
}

/* sets this.scale, which is canvas size / game size */
GameEngine.prototype.calcScale = function(extraVerticalSpace) {
	var compensation = this.sidebar.classList.contains('visible') ? sidebarWidth : 0;
	var targetWidth = Math.max(document.body.clientWidth - compensation, canvasMinimumWidth);
	var targetHeight = document.body.clientHeight - extraVerticalSpace;
	var scaleX = targetWidth/ this.width;
	var scaleY = targetHeight/ this.height;
	this.scaleY = this.scaleX = Math.min(scaleX, scaleY);

	if(Math.max(this.scaleX/ scaleX, scaleX/ this.scaleX,
	 this.scaleY/ scaleY, scaleY/ this.scaleY) <= maxCanvasStretch) {
		this.scaleX = scaleX;
		this.scaleY = scaleY;
	}
}

GameEngine.prototype.unlockStart = function() {
	this.startButton.disabled = false;
	this.startButton.innerHTML = 'Start Game';
	this.unlockTimeout = null;
}

GameEngine.prototype.sendParams = function() {
	var obj = {};
	obj.goal = parseInt(document.getElementById('goal').value);
	obj.v = parseInt(document.getElementById('velocity').value);
	obj.w = parseInt(document.getElementById('width').value);
	obj.h = parseInt(document.getElementById('height').value);
	obj.ts = parseFloat(document.getElementById('turnSpeed').value);
	obj.hsize = parseInt(document.getElementById('holeSize').value);
	obj.hfreq = parseInt(document.getElementById('holeFreq').value);
	obj.pencilmode = getPencilMode();
	obj.nmax = parseInt(document.getElementById('nmax').value);
	obj.torus = document.getElementById('torus').checked ? 1 : 0;
	obj.inkcap = parseInt(document.getElementById('inkCapacity').value);
	obj.inkregen = parseInt(document.getElementById('inkRegen').value);
	obj.inkdelay = parseInt(document.getElementById('inkDelay').value);

	this.sendMsg('setParams', obj);
}

GameEngine.prototype.sendStartGame = function() {
	var obj = {};

	if(debugMap != null && debugMap != '')
		this.editor.load(debugMap);
	
	if(this.editor.mapChanged) {
		obj.segments = this.editor.segments;
		this.editor.mapChanged = false;
	}
	
	if(debugComputers > 0)
		for(var i = 0; i < debugComputers; i++)
			this.addComputer();

	this.sendMsg('startGame', obj);
	this.startButton.disabled = true;
}

GameEngine.prototype.start = function(startPositions, startTime) {
	this.gameStartTimestamp = startTime - this.serverTimeDifference - this.ping
	 + extraGameStartTimeDifference;
	this.setGameState('countdown');
	var delay = this.gameStartTimestamp - Date.now();

	this.reset();
	this.debugSegments.length = 0;
	
	if(jsProfiling)
		console.profile('canvas performance');

	this.audioController.playSound('countdown');

	/* init players */
	for(var i = 0; i < startPositions.length; i++) {
		var player = this.getPlayer(startPositions[i].playerId);
		
		player.initialise(startPositions[i].startX,
		 startPositions[i].startY, startPositions[i].startAngle,
		 startPositions[i].holeStart);
	}
	
	if(this.pencilMode == 'on')
		pencil.enable(0);
	
	for(var i in this.players) {
		var player = this.players[i];
		if(player.status == 'left')
			player.finalTick = -1;
	}

	if(alwaysHideSidebar || touchDevice)
		this.setSidebarVisibility(false);

	this.resize();

	/* set up map segments on all contexts */
	for(var i = 1; i < backupStates.length; i++)
		this.contexts[i].drawImage(this.canvases[0], 0, 0, this.width, this.height);

	/* draw angle indicators */
	for(var i = 0; i < startPositions.length; i++)
		this.getPlayer(startPositions[i].playerId).drawIndicator();

	var self = this;
	this.gameloopTimeout = window.setTimeout(function() { self.realStart(); }, delay + this.tickLength);
	this.focusChat();
}


GameEngine.prototype.revertBackup = function() {
	var ceiledTick = Math.ceil(this.tick);

	/* false alarm, no revert required */
	if(this.correctionTick >= ceiledTick)
		return;

	this.redraws++;
	this.displayDebugStatus();

	/* calculate closest restore point */
	for(var stateIndex = backupStates.length - 1; this.correctionTick < ceiledTick - backupStates[stateIndex]; stateIndex--);

	/* reset next state to this point */
	for(var i in this.players) {
		var player = this.players[i];
		player.states[stateIndex + 1].copyState(player.states[stateIndex]);
	}

	/* copy to next canvas */
	var nextContext = this.contexts[stateIndex + 1];
	nextContext.drawImage(this.canvases[stateIndex], 0, 0, this.width, this.height);
	this.correctionTick = ceiledTick - backupStates[stateIndex + 1];

	/* simulate every player up to next backup point */
	this.updateContext(stateIndex + 1, true);
	
	/* not the right place i guess */
	this.handleSegmentsMessage(this.debugSegments);

	/* recurse all the way until we are at baseCanvas */
	this.revertBackup();
}

GameEngine.prototype.updateContext = function(stateIndex, floorTick) {
	for(var i in this.players) {
		var player = this.players[i];
		var tick = player.isLocal ? this.tick : this.tock;
		tick -= backupStates[stateIndex];

		if(floorTick)
			tick = Math.floor(tick);

		player.simulate(tick, this.contexts[stateIndex], player.states[stateIndex]);
	}

	this.drawCrosses(stateIndex);
}

GameEngine.prototype.drawCrosses = function(stateIndex) {
	for(var i = 0, len = this.crossQueue.length/ 2; i < len; i++)
		this.drawCross(this.contexts[stateIndex], this.crossQueue[2 * i], this.crossQueue[2 * i + 1]); 

	this.crossQueue = [];
}

GameEngine.prototype.drawCross = function(ctx, x, y) {	
	setLineColor(ctx, crossColor, 1);
	ctx.lineWidth = crossLineWidth;
	ctx.beginPath();
	ctx.moveTo(x - crossSize / 2, y - crossSize / 2);
	ctx.lineTo(x + crossSize / 2, y + crossSize / 2);
	ctx.moveTo(x + crossSize / 2, y - crossSize / 2);
	ctx.lineTo(x - crossSize / 2, y + crossSize / 2);
	ctx.stroke();
	ctx.lineWidth = lineWidth;
}

GameEngine.prototype.measureFPS = function() {
	var dt = this.tickLength * (this.tick - this.fpsMeasureTick);

	if(dt >= fpsInterval) {
		this.fps = 1000 * this.frameCount/ dt;
		this.fpsMeasureTick = this.tick;
		this.frameCount = 0;
		this.displayDebugStatus();
	}

	this.frameCount++;
}

GameEngine.prototype.gameloop = function() {
	if(this.state != 'playing' && this.state != 'watching')
		return;

	var endTick = (Date.now() - this.gameStartTimestamp)/ this.tickLength;
	var stateCount = backupStates.length - 1;

	if(displayDebugStatus)
		this.measureFPS();

	while(this.tick < endTick) {
		var nextIntegerTick = Math.floor(this.tick + 1);
		var wholeTick = (this.tick == Math.floor(this.tick));

		/* SIMULATE CPU LAG */
		if(wholeTick && simulateCPUlag && (this.tick % 200 == 199))
			for(var waitStart = Date.now(); Date.now() - waitStart < 4E2;);

		this.revertBackup();

		/* only update the baseCanvas every loop, the rest we can do
		 * on integer ticks */
		if(wholeTick)
			for(var i = 0; i < stateCount; i++)
				this.updateContext(i, true);

		this.updateContext(stateCount, false);

		pencil.doTick();
		pencilReceiver.doTick();

		this.tick = Math.min(nextIntegerTick, endTick);
		this.correctionTick = Math.ceil(this.tick);
		this.tock = Math.max(0, this.tick - tickTockDifference);
	}

	var self = this;
	var selfCall = function() { self.gameloop(); }

	if(vSync)
		requestAnimFrame(selfCall);
	else
		setTimeout(selfCall, 0);
}

GameEngine.prototype.realStart = function() {
	this.baseContext.drawImage(this.canvases[0], 0, 0, this.width, this.height);

	this.audioController.playSound('gameStart');
	this.setGameState('playing');
	this.sendMsg('enableInput', {});
	this.tick = 0;

	this.gameloop();
}

GameEngine.prototype.drawMapSegments = function(ctx) {
	ctx.fillStyle = canvasColor;
 	ctx.fillRect(0, 0, this.width, this.height);

	if(this.mapSegments.length > 0) {
		ctx.beginPath();
		setLineColor(ctx, mapSegmentColor, 1);

		for(var i = 0; i < this.mapSegments.length; i++) {
			var seg = this.mapSegments[i];
			ctx.moveTo(seg.x1, seg.y1);
			ctx.lineTo(seg.x2, seg.y2);
		}

		ctx.stroke();
	}
	
	for(var i in this.mapTeleports)
		drawTeleport(ctx, this.mapTeleports[i]);
}

GameEngine.prototype.createRewardNode = function(player, reward) {
	var node;
	var recycle = this.rewardNodes.length > 0;
	var w = rewardWidth;
	var h = rewardHeight;
	var playerState = player.states[backupStates.length - 1];

	if(recycle) {
		node = this.rewardNodes.pop();
	} else {
		node = document.createElement('div');
		node.className = 'reward';
	}
	
	node.innerHTML = '+' + reward;
	var left = playerState.x * this.scaleX - w / 2;
	left = Math.min(this.width * this.scaleX - w, Math.max(0, left));
	var top = playerState.y * this.scaleY - h - rewardOffsetY;
	if(top < 0)
		top += rewardOffsetY * 2 + h;
	node.style.left = left + 'px';
	node.style.top = top + 'px';
	
	if(recycle) {
		node.style.display = 'block';
	} else {
		this.canvasContainer.appendChild(node);
	}
	
	return node;
}

GameEngine.prototype.displayRewards = function(reward) {
	if(!reward)
		return;
	
	var self = this;
	var nodes = [];
	
	for(var i in this.players) {
		var player = this.players[i];
		if(player.status == 'alive') {
			nodes.push(this.createRewardNode(player, reward));
		}
	}
	
	function recycleRewards() {
		for(var i = 0; i < nodes.length; i++) {
			nodes[i].className = 'reward';
			nodes[i].style.display = 'none';
		}
		self.rewardNodes = self.rewardNodes.concat(nodes);
	}
	
	function startHidingRewards() { 
		for(var i = 0; i < nodes.length; i++) {
			nodes[i].classList.add('reward-hidden');
		}
	}
	
	window.setTimeout(startHidingRewards, rewardShowLength);
	window.setTimeout(recycleRewards, rewardShowLength + rewardMaxTransitionLength);
}

GameEngine.prototype.resize = function() {
	this.calcScale(0);
	var scaledWidth = Math.round(this.scaleX * this.width);
	var scaledHeight = Math.round(this.scaleY * this.height)
	this.canvasContainer.style.width = scaledWidth + 'px';
	this.canvasContainer.style.height = scaledHeight + 'px';

	for(var i = 0; i < backupStates.length; i++) {
		this.canvases[i].width = scaledWidth;
		this.canvases[i].height = scaledHeight;
		this.initContext(this.contexts[i]);
	}
	
	this.drawMapSegments(this.contexts[0]);

	this.correctionTick = -backupStates[1] - 1;
	this.revertBackup();
}

GameEngine.prototype.initContext = function(ctx) {
	ctx.scale(this.scaleX, this.scaleY);
	ctx.lineWidth = lineWidth;
	ctx.lineCap = lineCapStyle;
	ctx.drawLine = function(x1, y1, x2, y2) {
		ctx.beginPath();
		ctx.moveTo(x1, y1);
		ctx.lineTo(x2, y2);
		ctx.stroke();
	};
}

GameEngine.prototype.displayDebugStatus = function() {
	if(displayDebugStatus)
		this.debugBox.innerHTML = 'FPS: + ' + this.fps +
		 '<br/>Reverts: ' + this.redraws +
		 '<br/>Modified inputs: ' + this.modifiedInputs + '<br/>Time adjustments: ' +
		 this.adjustGameTimeMessagesReceived;
}

GameEngine.prototype.requestKick = function(id) {
	this.sendMsg('kick', {'playerId': id});
}

GameEngine.prototype.appendPlayerList = function(player) {
	var row = document.createElement('tr');
	var nameNode = document.createElement('td');
	var nameSpan = document.createElement('span');
	var kickLink = document.createElement('a');
	var statusNode = document.createElement('td');
	var pointsNode = document.createElement('td');
	var self = this;

	nameSpan.innerHTML = player.playerName;
	nameSpan.className = 'noverflow';
	player.row = row;

	kickLink.className = this.host == this.localPlayer ? 'close' : 'close hidden';
	kickLink.innerHTML = 'x';
	kickLink.addEventListener('click', function() { self.requestKick(parseInt(player.id)); });

	this.playerList.appendChild(row);
	if(player != this.localPlayer)
		nameNode.appendChild(kickLink);
	nameNode.appendChild(nameSpan);
	row.appendChild(nameNode);
	row.appendChild(statusNode);
	row.appendChild(pointsNode);
	player.updateRow();
	resizeChat();
}

GameEngine.prototype.clearPlayerList = function() {
	while(this.playerList.hasChildNodes())
		this.playerList.removeChild(this.playerList.firstChild);
	resizeChat();
}

/* sorts the player list by points in decreasing order */
GameEngine.prototype.sortPlayerList = function() {
	var rows = this.playerList.getElementsByTagName('tr'); // this is nodelist, we want array
	var arr = [];

	for (var i = 0, ref = arr.length = rows.length; i < ref; i++)
		arr[i] = rows[i];

	arr.sort(function(row1, row2) {
		var score1 = parseInt(row1.lastChild.innerHTML);
		var score2 = parseInt(row2.lastChild.innerHTML);
		return score1 == score2 ? 0 : (score1 > score2 ? -1 : 1);
	});

	for(var i = 1; i < arr.length; i++)
		if(arr[i] != this.playerList.lastChild) {
			this.playerList.removeChild(arr[i]);
			this.playerList.appendChild(arr[i]);
		}
}

GameEngine.prototype.sendChat = function() {
	var msg = this.chatBar.value;

	if(this.state == 'new' || msg.length < 1)
		return;

	this.sendMsg('chat', {'message': msg});
	this.chatBar.value = '';
	this.printChat(this.localPlayer, msg);
}

GameEngine.prototype.focusChat = function() {
	if(!touchDevice)
		this.chatBar.focus();
}

GameEngine.prototype.backToGameLobby = function() {	
	// remove players who left game & set status for other players
	for(var i in this.players) {
		var player = this.players[i];

		if(player.status == 'left')
			this.removePlayer(player);
		else {
			player.status = player.isHost ? 'host' : 'ready';
			player.points = 0;
			player.updateRow();
		}
	}
}

GameEngine.prototype.copyGamePos = function(e, pos) {
	pos.x = e.pageX;
	pos.y = e.pageY;
	pos.subtract(this.canvasPos);
	pos.x = Math.round(Math.max(Math.min(this.width, pos.x), 0))
	pos.y = Math.round(Math.max(Math.min(this.height, pos.y), 0));
	
	return pos;
}

GameEngine.prototype.getGamePos = function(e) {
	var pos = new Vector(0, 0);
	this.copyGamePos(e, pos);
	return pos;
}