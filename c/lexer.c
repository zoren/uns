
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdlib.h>

typedef enum
{
  UNSET,
  WORD,
  START_LIST = '[',
  END_LIST = ']',
  BAD_CHAR,
  WORD_TOO_LONG,
  EOF_TOKEN
} token_type;

typedef struct
{
  token_type type;
  int len;
  const char *word;
} token;

#define BUFSIZE (128 - 1)

typedef enum
{
  STATE_START,
  STATE_WORD,
  STATE_START_LIST,
  STATE_END_LIST
} State;

typedef struct
{
  FILE *file;
  char buf[BUFSIZE], *lim, *cur, *tok;
  State state;
  bool eof;
} FileLexerState;

token_type fill(FileLexerState *st)
{
  if (st->eof)
  {
    printf("fill EOF\n");
    return EOF_TOKEN;
  }
  const size_t shift = st->tok - st->buf;
  const size_t used = st->lim - st->tok;
  const size_t free = BUFSIZE - used;

  // Error: no space. In real life can reallocate a larger buffer.
  if (free < 1)
  {
    printf("Error: no space\n");
    return WORD_TOO_LONG;
  }

  memmove(st->buf, st->tok, used);
  st->lim -= shift;
  st->cur -= shift;
  st->tok -= shift;

  // Fill free space at the end of buffer with new data.
  const size_t read = fread(st->lim, 1, free, st->file);
  if (read == 0)
  {
    st->eof = true;
  }
  st->lim += read;
  st->lim[0] = 0; // append sentinel symbol

  return UNSET;
}

char getCurrentChar(FileLexerState *st)
{
  if (st->cur >= st->lim)
  {
    const token_type t = fill(st);
    if (t != 0)
    {
      return 0;
    }
  }
  return *st->cur;
}

token lex_one(FileLexerState *st)
{
  char c;
  while (1)
  {
    st->tok = st->cur;
  next:
    c = getCurrentChar(st);
    const State prevState = st->state;
    switch (c)
    {
    case '\0':
      return (token){EOF_TOKEN, 0, NULL};
    case ' ':
    case '\n':
    {
      st->state = STATE_START;
      if (prevState == STATE_WORD)
        return (token){WORD, st->cur - st->tok, st->tok};
      st->cur++;
      continue;
    }

    case '[':
    case ']':
    {
      st->state = STATE_START;
      if (prevState == STATE_WORD)
        return (token){WORD, st->cur - st->tok, st->tok};
      st->cur++;
      return (token){c, 1, NULL};
    }

    case 'a' ... 'z':
    case '0' ... '9':
    case '-':
    case '.':
    case '=':
      st->state = STATE_WORD;
      st->cur++;
      goto next;

    default:
      return (token){BAD_CHAR, 1, st->tok};
    }
  }
  if (st->state == STATE_WORD)
    return (token){WORD, st->cur - st->tok, st->tok};
  return (token){EOF_TOKEN, 0, NULL};
}

int main(int argc, char **argv)
{
  if (argc < 2)
  {
    printf("Usage: %s <filename>\n", argv[0]);
    exit(1);
  }
  FILE *file = fopen(argv[1], "r");
  if (file == NULL)
  {
    printf("Error: could not open file\n");
    exit(1);
  }
  FileLexerState st;
  st.file = file;
  st.cur = st.tok = st.lim = st.buf + BUFSIZE;
  st.eof = false;
  // Sentinel (at YYLIMIT pointer) is set to zero, which triggers YYFILL.
  st.lim[0] = 0;
  st.state = STATE_START;
  token t;
  do
  {
    t = lex_one(&st);
    switch (t.type)
    {
    case WORD:
      printf("WORD: %.*s  (%d)\n", t.len, t.word, t.len);
      break;
    case START_LIST:
      printf("START_LIST\n");
      break;
    case END_LIST:
      printf("END_LIST\n");
      break;
    case EOF_TOKEN:
      printf("EOF\n");
      break;
    case BAD_CHAR:
      printf("BAD_CHAR: ");
      break;
    case WORD_TOO_LONG:
      printf("WORD_TOO_LONG: ");
      break;
    default:
      printf("UNSET: ");
      break;
    }

  } while (t.type != EOF_TOKEN);
  fclose(file);
}
