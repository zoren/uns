// re2c $INPUT -o $OUTPUT
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>

/*!max:re2c*/
#define BUFSIZE (64 - YYMAXFILL)

// token typedef
enum token_type
{
    WORD,
    START_LIST,
    END_LIST,
    WAITING,
    BAD_CHAR,
    EOF_TOKEN
};

char* token_type_to_string(enum token_type type)
{
    switch (type)
    {
    case WORD:
        return "WORD";
    case START_LIST:
        return "START_LIST";
    case END_LIST:
        return "END_LIST";
    case WAITING:
        return "WAITING";
    case BAD_CHAR:
        return "BAD_CHAR";
    case EOF_TOKEN:
        return "EOF_TOKEN";
    default:
        return "UNKNOWN";
    }
}

typedef struct
{
    enum token_type type;
    int len;
    const char *word;
} token;

typedef struct
{
    FILE *file;
    char buf[BUFSIZE + 1], *lim, *cur, *mar, *tok;
    int state;
} State;

typedef enum
{
    READY,
    BIG_PACKET
} FillStatus;

static FillStatus fill_state(State *st)
{
    const size_t shift = st->tok - st->buf;
    const size_t used = st->lim - st->tok;
    const size_t free = BUFSIZE - used;

    // Error: no space. In real life can reallocate a larger buffer.
    if (free < 1)
        return BIG_PACKET;

    // Shift buffer contents (discard already processed data).
    memmove(st->buf, st->tok, used);
    st->lim -= shift;
    st->cur -= shift;
    st->mar -= shift;
    st->tok -= shift;

    // Fill free space at the end of buffer with new data.
    const size_t read = fread(st->lim, 1, free, st->file);
    st->lim += read;
    st->lim[0] = 0; // append sentinel symbol

    return READY;
}

token lex_one(State *st)
{
    char yych;
    /*!getstate:re2c*/
    /*!stags:re2c format = 'const char *@@;'; */
    const char *content, *end;
    for (;;)
    {
        st->tok = st->cur;
        /*!re2c
    re2c:api = custom;
    re2c:api:style = free-form;
    re2c:eof = 0;

    re2c:define:YYCTYPE    = "char";
    re2c:define:YYCURSOR   = "st->cur";
    re2c:define:YYMARKER   = "st->mar";
    re2c:define:YYLIMIT    = "st->lim";
    re2c:define:YYGETSTATE = "st->state";
    re2c:define:YYSETSTATE = "st->state = @@;";
    re2c:define:YYFILL     = "return (token){WAITING, -1, NULL};";

    re2c:define:YYLESSTHAN = "st->cur >= st->lim";
    re2c:define:YYPEEK = "st->cur < st->lim ? *(st->cur) : 0";  // fake null
    re2c:define:YYSKIP = "++(st->cur);";
    re2c:define:YYSTAGP = "@@ = st->cur;";
    re2c:define:YYSTAGN = "@@ = NULL;";
    re2c:define:YYSHIFTSTAG  = "@@{tag} += @@{shift};";

    word = [a-z0-9.=\\-]+;
    whitespace = [ \n]+;

    whitespace { continue; }
    "["  { return (token){START_LIST, 1, NULL}; }
    @content [\]]+ @end { return (token){END_LIST, end - content, NULL}; }
    @content word @end { return (token){WORD, end - content, content}; }
    $    { return (token){EOF_TOKEN, -1, NULL}; }
    *    { return (token){BAD_CHAR, -1, NULL}; }
        */
    }
}

int main(int argc, char** argv)
{
    if (argc != 2)
    {
        printf("Usage: %s <input_file>\n", argv[0]);
        return 1;
    }
    
    const char *fname = argv[1];

    FILE *fr = fopen(fname, "r");

    State st;
    st.file = fr;
    st.cur = st.mar = st.tok = st.lim = st.buf + BUFSIZE;
    // Sentinel (at YYLIMIT pointer) is set to zero, which triggers YYFILL.
    st.lim[0] = 0;
    st.state = -1;

    FillStatus status;

    // Run the lexer.
    while (true)
    {
        token t = lex_one(&st);
        fflush(stdout);
        if (t.type == WAITING) {
            status = fill_state(&st);
            if (status == BIG_PACKET) {
                printf("Error: no space in buffer\n");
                break;
            }
            continue;
        }
        if (t.type == EOF_TOKEN)
            break;
        const char *typeStr = token_type_to_string(t.type);
        // printf("token type: %.*s\n", (int)strlen(type), type);

        // printf("token: %.*s %.*s %d\n", (int)strlen(typeStr), typeStr, t.len, t.word, t.len);
        switch (t.type)
        {
        case START_LIST:
            printf("[\n");
            break;
        case END_LIST:
            printf("] %d\n", t.len);
            break;
        case WORD:
            printf("%.*s %d\n", t.len, t.word, t.len);
        default:
            break;
        }
    }

    // Cleanup: remove input file.
    fclose(fr);
    return 0;
}
