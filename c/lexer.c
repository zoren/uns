
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
  WHITESPACE
} token_type;

typedef struct
{
  token_type type;
  int len;
  const char *word;
} token;

void print_token(token t)
{
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
  case WHITESPACE:
    printf("WHITESPACE\n");
    break;
  default:
    printf("UNSET: ");
    break;
  }
}

#define BUFSIZE (128 - 1)

typedef struct
{
  FILE *file;
  char buf[BUFSIZE], *lim, *cur, *tok;
  token_type state;
  bool eof;
  int byte_offset;
} FileLexerState;

token_type fill(FileLexerState *st)
{
  if (st->eof)
  {
    printf("fill EOF\n");
    return 1;
  }
  const size_t shift = st->tok - st->buf;
  const size_t used = st->lim - st->tok;
  const size_t free = BUFSIZE - used;

  // Error: no space. In real life can reallocate a larger buffer.
  if (free < 1)
  {
    printf("Error: no space\n");
    return 2;
  }

  memmove(st->buf, st->tok, used);
  st->lim -= shift;
  st->cur -= shift;
  st->tok -= shift;
  st->byte_offset += shift;

  // Fill free space at the end of buffer with new data.
  const size_t read = fread(st->lim, 1, free, st->file);
  if (read == 0)
  {
    st->eof = true;
  }
  st->lim += read;
  st->lim[0] = 0; // append sentinel symbol

  return 0;
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

bool hasMoreChars(FileLexerState *st)
{
  if (st->cur >= st->lim)
  {
    const token_type t = fill(st);
    if (t != 0)
    {
      return false;
    }
  }
  return true;
}

int peek_char(FileLexerState *st)
{
  if (st->cur >= st->lim)
  {
    const token_type t = fill(st);
    if (t != 0)
    {
      return -1;
    }
    if (st->cur >= st->lim)
    {
      return -1;
    }
  }
  return *st->cur;
}

void next_char(FileLexerState *st)
{
  if (st->cur >= st->lim)
  {
    const token_type t = fill(st);
    if (t != 0)
    {
      return;
    }
  }
  st->cur++;
}

token_type classify_char(char c)
{
  switch (c)
  {
  case ' ':
  case '\n':
    return WHITESPACE;
  case '[':
  case ']':
    return c;
  case 'a' ... 'z':
  case '0' ... '9':
  case '-':
  case '.':
  case '=':
    return WORD;
  default:
    printf("classify_char: bad char\n");
    exit(1);
  }
}

typedef enum
{
  form_word,
  form_list
} form_tag;

typedef struct form
{
  form_tag tag;
  union
  {
    char *word;
    struct
    {
      struct form *forms;
      int len;
    };
  } u;
} form_t;

form_t parse(FileLexerState *st)
{
  char c;
next:
  c = peek_char(st);
  if (c < 0)
  {
    printf("parse Error: unexpected EOF\n");
    exit(1);
  }
  switch (classify_char(c))
  {
  case WHITESPACE:
    next_char(st);
    goto next;
  case WORD:
  {
    form_t form;
    form.tag = form_word;
    const char *word_start = st->cur;
    do
    {
      next_char(st);
    } while (classify_char(peek_char(st)) == WORD);
    const int len = st->cur - word_start;
    form.u.word = malloc(len + 1);
    memcpy(form.u.word, word_start, len);
    form.u.word[len] = '\0';
    return form;
  }
  case START_LIST:
  {
    next_char(st);
    form_t form;
    form.tag = form_list;
    form.u.forms = malloc(sizeof(form_t) * 10);
    form.u.len = 0;
    while (1)
    {
      c = peek_char(st);
      if (c < 0)
      {
        printf("parse Error: unexpected EOF\n");
        exit(1);
      }
      const token_type class = classify_char(c);
      if (class == END_LIST)
      {
        next_char(st);
        return form;
      }
      if (class == WHITESPACE)
      {
        next_char(st);
        continue;
      }

      if (form.u.len == 10)
      {
        printf("Error: list too long\n");
        exit(1);
      }
      form.u.forms[form.u.len++] = parse(st);
    }
    return form;
  }

  default:
    printf("parse Error: unexpected token\n");
    exit(1);
    break;
  }
}

void print_form(form_t form)
{
  switch (form.tag)
  {
  case form_word:
    printf("WORD: %s\n", form.u.word);
    break;
  case form_list:
    printf("LIST: %d\n", form.u.len);
    for (int i = 0; i < form.u.len; i++)
    {
      print_form(form.u.forms[i]);
    }
    break;
  }
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
  st.lim[0] = 0;
  st.state = UNSET;
  st.byte_offset = 0;

  form_t form = parse(&st);
  print_form(form);
  fclose(file);
}
