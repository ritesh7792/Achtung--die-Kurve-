#define log(...) {LOGTICK; LOGMSG(__VA_ARGS__);}
#define loggame(gm, ...) {LOGTICK; LOGGAME(gm); LOGMSG(__VA_ARGS__);}
#define logplayer(usr, ...) {LOGTICK; LOGGAME(usr->gm); LOGPLAYER(usr); LOGMSG(__VA_ARGS__);}
#define LOGTICK {logtime(); LOGMSG("%4lu ", serverticks % 10000);}
#define LOGGAME(gm) if(gm) LOGMSG("g:%-4d ", gm->id)
#define LOGPLAYER(usr) LOGMSG("u:%-4d ", usr->id)
#define LOGMSG(...) printf(__VA_ARGS__)

#define warning(...) {WARNINGTICK; WARNINGMSG(__VA_ARGS__);}
#define warninggame(gm, ...) {WARNINGTICK; WARNINGGAME(gm); WARNINGMSG(__VA_ARGS__);}
#define warningplayer(usr, ...) {WARNINGTICK; WARNINGGAME(usr->gm); WARNINGPLAYER(usr); WARNINGMSG(__VA_ARGS__);}
#define WARNINGTICK {logwarningtime(); WARNINGMSG("%4lu ", serverticks % 10000);}
#define WARNINGGAME(gm) if(gm) WARNINGMSG("g:%-4d ", gm->id)
#define WARNINGPLAYER(usr) WARNINGMSG("u:%-4d ", usr->id)
#define WARNINGMSG(...) fprintf(stderr, __VA_ARGS__)

/******************************************************************
 * MEMORY-RELATED
 */

// safe malloc, exit(500) on error
void *smalloc(size_t size) {
	void *a = malloc(size);
	if(!a) {
		printf("malloc failed, exiting..\n");
		exit(500);
	}
	return a;
}

void *scalloc(size_t num, size_t size) {
	void *a = calloc(num, size);
	if(!a) {
		printf("calloc failed, exiting..\n");
		exit(500);
	}
	return a;
}

void *srealloc(void *ptr, size_t size) {
	void *a = realloc(ptr, size);
	if(!a) {
		printf("realloc failed, exiting..\n");
		exit(500);
	}
	return a;
}

struct seg *copyseg(const struct seg *a) {
	struct seg *b = smalloc(sizeof(struct seg));
	return memcpy(b, a, sizeof(struct seg));
}

/******************************************************************
 * JSON HELP FUNCTIONS
 */

#define jsonaddnum cJSON_AddNumberToObject
#define jsonaddstr cJSON_AddStringToObject
#define jsonaddfalse cJSON_AddFalseToObject
#define jsonaddtrue cJSON_AddTrueToObject
#define jsonaddjson cJSON_AddItemToObject
#define jsonprint cJSON_PrintUnformatted
#define jsonaddbool(json, name, value) cJSON_AddItemToObject(json, name, cJSON_CreateBool(value))
#define jsondel	cJSON_Delete
#define max(a,b) ((b) > (a) ? (b) : (a))
#define min(a,b) ((b) > (a) ? (a) : (b))

// returns NULL on error
char *jsongetstr(cJSON *json, char* obj) {
	json = cJSON_GetObjectItem(json, obj);
	if(!json) {
		if(DEBUG_MODE) printf("json parse error! object '%s' not found!\n", obj);
		return 0;
	}
	return json->valuestring;
}

// returns -1 on error
int jsongetint(cJSON *json, char* obj) {
	json = cJSON_GetObjectItem(json, obj);
	if(!json) {
		if(DEBUG_MODE) printf("json parse error! object '%s' not found!\n", obj);
		return -1;
	}
	return json->valueint;
}

// returns -1 on error
float jsongetfloat(cJSON *json, char* obj) {
	json = cJSON_GetObjectItem(json, obj);
	if(!json) {
		if(DEBUG_MODE) printf("json parse error! object '%s' not found!\n", obj);
		return -1;
	}
	return json->valuedouble;
}

// returns NULL on error
cJSON *jsongetjson(cJSON *json, char* obj) {
	json = cJSON_GetObjectItem(json, obj);
	if(!json) {
		if(DEBUG_MODE) printf("json parse error! object '%s' not found!\n", obj);
		return 0;
	}
	return json;
}

// to check if a member exists
cJSON *jsoncheckjson(cJSON *json, char* obj) {
	return cJSON_GetObjectItem(json, obj);
}

void jsonsetstr(cJSON *json, char* obj, char* str) {
	json = cJSON_GetObjectItem(json, obj);
	if(!json) {
		if(DEBUG_MODE) printf("json parse error! object '%s' not found!\n", obj);
		return ;
	}
	json->valuestring = str;
}


void jsonsetbool(cJSON *json, char* obj, char value) {
	json = cJSON_GetObjectItem(json, obj);
	if(!json) {
		if(DEBUG_MODE) printf("json parse error! object '%s' not found!\n", obj);
		return ;
	}
	json->type = value ? cJSON_True : cJSON_False;
}

void jsonsetnum(cJSON *json, char* obj, double val) {
	json = cJSON_GetObjectItem(json, obj);
	if(!json) {
		if(DEBUG_MODE) printf("json parse error! object '%s' not found!\n", obj);
		return ;
	}
	json->valuedouble = val;
	json->valueint = val;
}

cJSON *jsoncreate(char *mode) {
	cJSON *json = cJSON_CreateObject();
	cJSON_AddStringToObject(json, "mode", mode);
	return json;
}

cJSON *getjsongamepars(struct game *gm) {
	cJSON *json = jsoncreate("gameParameters");
	char buf[20];

	jsonaddnum(json, "countdown", COUNTDOWN);
	jsonaddnum(json, "hsize", gm->hsize);
	jsonaddnum(json, "hfreq", gm->hfreq);
	jsonaddnum(json, "w", gm->w);
	jsonaddnum(json, "h", gm->h);
	jsonaddnum(json, "nmin", gm->nmin);
	jsonaddnum(json, "nmax", gm->nmax);
	jsonaddnum(json, "v", gm->v);
	jsonaddnum(json, "ts", gm->ts);
	jsonaddnum(json, "id", gm->id);
	jsonaddnum(json, "goal", gm->goal);
	jsonaddstr(json, "type", gametypetostr(gm->type, buf));
	jsonaddstr(json, "pencilmode", pencilmodetostr(gm->pencilmode, buf));
	jsonaddnum(json, "torus", gm->torus);
	jsonaddnum(json, "inkcap", gm->inkcap);
	jsonaddnum(json, "inkregen", gm->inkregen);
	jsonaddnum(json, "inkdelay", gm->inkdelay);
	jsonaddnum(json, "inkstart", gm->inkstart);
	jsonaddnum(json, "inkmousedown", gm->inkmousedown);
	
	return json;
}

/******************************************************************
 * LIBWEBSOCKETS HELP FUNCTIONS
 */

/* pads str and puts it in send buffer for user */
void sendstr(char *str, int len, struct user *u) {
	char *buf;

	if(u->inputmechanism != inputmechanism_human)
		return;

	if(u->sbat == SB_MAX) {
		if(SHOW_WARNING) printf("send-buffer full.\n");
		return;
	}

	// being freed inside callback
	buf = smalloc(PRE_PADDING + len + POST_PADDING);
	memcpy(buf + PRE_PADDING, str, len);

	u->sbmsglen[u->sbat] = len;
	u->sb[u->sbat++] = buf;

	if(ULTRA_VERBOSE) {
		// zero terminate for print
		char *tmp = smalloc(len + 1);
		memcpy(tmp, buf + PRE_PADDING, len);
		tmp[len] = 0;
		printf("queued msg %s for user %d\n", tmp, u->id);
		free(tmp);
	}

	libwebsocket_callback_on_writable(ctx, u->wsi);
}

void sendjson(cJSON *json, struct user *u) {
	char *buf;

	if(u->inputmechanism != inputmechanism_human)
		return;

	buf = jsonprint(json);
	sendstr(buf, strlen(buf), u);
	free(buf);
}

void sendstrtogame(char *msg, int len, struct game *gm, struct user *outsider) {
	struct user *usr;

	for(usr = gm->usr; usr; usr = usr->nxt)
		if(usr != outsider)
			sendstr(msg, len, usr);
}

/* sends a json object to all in game, except for outsider */
void sendjsontogame(cJSON *json, struct game *gm, struct user *outsider) {
	char *buf = jsonprint(json);
	sendstrtogame(buf, strlen(buf), gm, outsider);
	free(buf);
}

char *duplicatestring(char *orig) {
	return strcpy(smalloc(strlen(orig) + 1), orig);
}

struct buffer encodemap(struct map *map) {
	struct buffer buf;
	struct seg *seg;
	struct teleport *tel;
	
	buf.start = 0;
	allocroom(&buf, 200);
	appendheader(&buf, MODE_SETMAP, 0);

	for(tel = map->teleports; tel; tel = tel->nxt) {
		allocroom(&buf, 13);
		*buf.at++ = tel->colorid | 32;
		seg = &tel->seg;
		appendpos(&buf, seg->x1, seg->y1);
		appendpos(&buf, seg->x2, seg->y2);
		seg = &tel->seg.dest->seg;
		appendpos(&buf, seg->x1, seg->y1);
		appendpos(&buf, seg->x2, seg->y2);
	}

	// this marks start of segments
	allocroom(&buf, 1);
	*buf.at++ = 0;

	for(seg = map->seg; seg; seg = seg->nxt) {
		allocroom(&buf, 6);
		appendpos(&buf, seg->x1, seg->y1);
		appendpos(&buf, seg->x2, seg->y2);
	}
	return buf;
}

void sendmaptogame(struct map *map, struct game *gm, struct user *outsider) {
	struct buffer buf = encodemap(map);
	sendstrtogame(buf.start, buf.at - buf.start, gm, outsider);
	free(buf.start);
}

void sendmap(struct map *map, struct user *usr) {
	struct buffer buf = encodemap(map);
	sendstr(buf.start, buf.at - buf.start, usr);
	free(buf.start);
}

/******************************************************************
 * BYTE MESSAGES
 */

/* sends updated tick for the last input of usr in 4 bytes
 * m = mode, j = input index, d = tickdelta
 * layout: xjjjjmmm xjjjjjjj xdddjjjj xddddddd */
void modifiedmsg(struct user *usr, int tickdelta) {
	char response[4];
	int index = usr->inputcount;

	logplayer(usr, "sending modifiedmsg, input = %d, delta = %d\n", index, tickdelta);

	response[0] = 7 & MODE_MODIFIED;
	response[0] |= (127 - 7) & (index << 3);
	response[1] = 127 & (index >> 4);
	response[2] = 15 & (index >> 11);
	response[2] |= (127 - 15) & (tickdelta << 4);
	response[3] = 127 & (tickdelta >> 3);

	sendstr(response, 4, usr);
}

/* sends tick update for user to his game in 3 bytes
 * layout: xdiiimmm xddddddd xddddddd */
void tickupdatemsg(struct user *usr, int tickdelta) {
	char response[3];

	response[0] = 7 & MODE_TICKUPDATE;
	response[0] |= (8 + 16 + 32) & (usr->index << 3);
	response[0] |= 64 & (tickdelta << 6);
	response[1] = 127 & (tickdelta >> 1);
	response[2] = 127 & (tickdelta >> 8);

	sendstrtogame(response, 3, usr->gm, usr);
}

/* encodes index (i), tickdelta (d) and turn (t) in 2 bytes
 * layout: xdddtiii xddddddd */
void encodesteer(char *target, unsigned short index, unsigned short tickdelta, unsigned char turnchange) {
	target[0] = 7 & index;
	target[0] |= (1 & turnchange) << 3;
	target[0] |= (16 + 32 + 64) & (tickdelta << 4);
	target[1] = 127 & (tickdelta >> 3);
}

char turnchange(char newturn, char oldturn) {
	if(newturn == 1)
		return 1;

	if(newturn == -1)
		return 0;

	return oldturn == 1;
}

/* handles steer message, timeouts and modifications */
void steermsg(struct user *usr, int tick, int turn, int delay) {
	char response[2];
	int turndelta = turnchange(turn, usr->lastinputturn);
	int tickdelta = tick - usr->lastinputtick;

	/* not enough bits to encode tickdelta, work around this */
	if(tickdelta >= (1 << 10)) {
		tickupdatemsg(usr, tickdelta - 1);
		tickdelta = 1;
	}

	encodesteer(response, usr->index, tickdelta, turndelta);
	sendstrtogame(response, 2, usr->gm, usr);

	if(delay)
		modifiedmsg(usr, delay);

	usr->lastinputtick = tick;
	usr->lastinputturn = turn;
	usr->inputcount++;
}

void allocroom(struct buffer *buf, int size) {
	if(!buf->start) {
		buf->at = buf->start = smalloc(size);
		buf->end = buf->start + size;
	} else if(buf->end - buf->at < size){
		int len = buf->at - buf->start;
		int capacity = buf->end - buf->start;
		
		capacity *= 2;
		if(capacity < size)
			capacity = size;
		
		buf->start = srealloc(buf->start, capacity);
		buf->at = buf->start + len;
		buf->end = buf->start + capacity;
	}
}

void appendheader(struct buffer *buf, char type, char player) {
	*buf->at++ = type | player << 3;
}

void appendpos(struct buffer *buf, int x, int y) {
	*buf->at++ = x & 127;
	*buf->at++ = (x >> 7 & 15) | (y << 4 & (16 + 32 + 64));
	*buf->at++ = y >> 3 & 127;
}

void appendpencil(struct buffer *buf, char down, int tick) {
	*buf->at++ = down | (tick << 1 & 127);
}

void appendpencil_full(struct buffer *buf, char down, int tick) {
	appendpencil(buf, down, tick);
	*buf->at++ = tick >> 6 & 127;
	*buf->at++ = tick >> 13 & 127;
}

/******************************************************************
 * THIS-TO-THAT CONVERTERS
 */

char *gametypetostr(int gametype, char *str) {
	if(gametype == GT_AUTO)
		return strcpy(str, "auto");
	if(gametype == GT_LOBBY)
		return strcpy(str, "lobby");
	return strcpy(str, "custom");
}

char *statetostr(int gamestate, char *str) {
	if(gamestate == GS_LOBBY)
		return strcpy(str, "lobby");
	return (gamestate == GS_STARTED) ? strcpy(str, "started") : strcpy(str, "ended");
}

char *leavereasontostr(int reason, char *str) {
	if(reason == LEAVE_NORMAL)
		return strcpy(str, "normal");
	if(reason == LEAVE_DISCONNECT)
		return strcpy(str, "disconnected");
	return strcpy(str, "kicked");
}

char *pencilmodetostr(int pencilmode, char *str) {
	if(pencilmode == PM_ON)
		return strcpy(str, "on");
	return (pencilmode == PM_ONDEATH) ? strcpy(str, "ondeath") : strcpy(str, "off");
}

int strtopencilmode(char *pencilstr) {
	if(!strcmp(pencilstr, "on"))
		return PM_ON;
	if(!strcmp(pencilstr, "ondeath"))
		return PM_ONDEATH;
	return PM_OFF;
}

/******************************************************************
 * REST
 */

float roundavgpts(int players, int (*pointsys)(int, int)) {
	int i, total = 0;

	for(i = players; --i; total += i * pointsys(players, i));

	return total/ (float) players;
}

/* is there no extension, return "" */
char *getFileExt(char *path) {
	char *ext, *point = strrchr(path, '.');
	int extLen;

	if(!point || point < strrchr(path, '/'))
		return scalloc(1, 1);
	
	point++;

	ext = smalloc((extLen = strlen(point)) + 1);
	ext[extLen] = 0; 

	/* do some strtolower action (why isnt this in standard libs? :S) */
	for(point += --extLen; extLen >= 0; point--)
		ext[extLen--] = ('A' <= *point && *point <= 'Z') ? ((*point) - 26) : *point;

	return ext;
}

static long servermsecs() {
	static struct timeval tv;
	static long serverstart = -1;
	if(serverstart == -1) {
		serverstart = 0;
		serverstart = servermsecs();
	}
	gettimeofday(&tv, 0);
	return 1000 * tv.tv_sec + tv.tv_usec/ 1000 - serverstart;
}

float getlength(float x, float y) {
	return sqrt(x * x + y * y);
}

char seginside(struct seg *seg, int w, int h) {
	return min(seg->x1, seg->x2) >= 0 && min(seg->y1, seg->y2) >= 0 &&
	 max(seg->x1, seg->x2) <= w && max(seg->y1, seg->y2) <= h;
}

/******************************************************************
 * DEBUGGING HELPERS
 */

void printuser(struct user *u) {
	printf("user %d: name = %s, in game = %p\n", u->id, u->name ? u->name : "(null)", (void *)u->gm);
}

void printgame(struct game *gm) {
	struct user *usr;
	printf("game %p: n = %d, state = %d, users =\n", (void *)gm, gm->n, gm->state);
	for(usr = gm->usr; usr; usr = usr->nxt) {
		printf("\t");
		printuser(usr);
	}
}

void printgames() {
	struct game *gm = headgame;
	if(!gm) printf("no games active\n");
	for(; gm; gm =gm->nxt)
		printgame(gm);
}

void printseg(struct seg *seg) {
	printf("(%.2f, %.2f)->(%.2f, %.2f)", seg->x1, seg->y1, seg->x2, seg->y2);
}

void printjson(cJSON *json) {
	char *buf = cJSON_Print(json);
	printf("%s\n", buf);
	free(buf);
}

void logtime() {
	if(servermsecs() - lastlogtime > 1000 * 60 * 5) {
		struct tm *local;
		time_t t;

		t = time(NULL);
		local = localtime(&t);

		LOGMSG("%s", asctime(local));
		lastlogtime = servermsecs();
	}
}

void logwarningtime() {
	if(servermsecs() - lastwarninglogtime > 1000 * 60 * 5) {
		struct tm *local;
		time_t t;

		t = time(NULL);
		local = localtime(&t);

		WARNINGMSG("%s", asctime(local));
		lastwarninglogtime = servermsecs();
	}
}

/******************************************************************
 * INPUT_CONTROL
 */

/* returns 1 in case of spam, 0 if OK */
int checkspam(struct user *usr, int category) {
	return ++usr->msgcounter[category] > spam_maxs[category];
}

/* resets due spam counters for users in game */
void resetspamcounters(struct game *gm, int tick) {
	struct user *usr;
	int i, reset;

	for(i = 0; i < SPAM_CAT_COUNT; i++) {
		reset = (tick % spam_intervals[i]) == 0;

		for(usr = gm->usr; usr; usr = usr->nxt)
			if(reset)
				usr->msgcounter[i] = 0;
	}
}

/* checks that 0 < name size <= MAX_NAME_LENGTH and does not exclusively consist of 
 * chars like space */
char *checkname(char *name) {
	char nameok = 0, notonly[1] = {' '}, *checkedName;
	int i, j;

	for(i = 0; name[i]; i++)
		for(j = 0; j < 1; j++)
			nameok |= name[i] != notonly[j];

	checkedName = smalloc(MAX_NAME_LENGTH + 1);
	
	strncpy(checkedName, nameok ? name : SHAME_NAME, MAX_NAME_LENGTH);
	checkedName[MAX_NAME_LENGTH] = 0;

	return checkedName;
}
