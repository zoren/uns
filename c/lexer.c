
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdlib.h>
#include <ctype.h>

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
  ssize_t len;
  union
  {
    // add length to word
    char *word;
    struct form *forms;
  };
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
    form.len = len;
    form.word = malloc(len + 1);
    memcpy(form.word, word_start, len);
    form.word[len] = '\0';
    return form;
  }
  case START_LIST:
  {
    next_char(st);
    form_t form;
    form.tag = form_list;
    // todo make them growable, and trim to size on return
    form.forms = malloc(sizeof(form_t) * 10);
    form.len = 0;
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

      if (form.len == 10)
      {
        printf("Error: list too long\n");
        exit(1);
      }
      form.forms[form.len++] = parse(st);
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
    printf("%s", form.word);
    break;
  case form_list:
    if (form.len == 0)
    {
      printf("[]");
      return;
    }
    printf("[");
    print_form(form.forms[0]);

    for (int i = 1; i < form.len; i++)
    {
      printf(" ");
      print_form(form.forms[i]);
    }
    printf("]");
    break;
  }
}

const form_t unit = {.tag = form_list, .len = 0, .forms = NULL};
const form_t continueSpecialWord = {.tag = form_word, .len = 0, .word = " continue special value "};

typedef struct
{
  char *word;
  form_t form;
} Binding;

typedef struct Env
{
  struct Env *parent;
  int len;
  Binding *bindings;
} Env_t;

bool isDecimalWord(form_t word)
{
  if (word.tag != form_word)
    return false;
  for (int i = 0; i < word.len; i++)
  {
    if (isdigit(word.word[i]) == 0)
      return false;
  }
  return true;
}

form_t add(form_t a, form_t b)
{
  assert(isDecimalWord(a) && isDecimalWord(b) && "add requires decimal words");
  const int r = atoi(a.word) + atoi(b.word);
  char *result = malloc(12);
  sprintf(result, "%d", r);
  return (form_t){.tag = form_word, .len = strlen(result), .word = result};
}

form_t sub(form_t a, form_t b)
{
  assert(isDecimalWord(a) && isDecimalWord(b) && "sub requires decimal words");
  const int r = atoi(a.word) - atoi(b.word);
  char *result = malloc(12);
  sprintf(result, "%d", r);
  return (form_t){.tag = form_word, .len = strlen(result), .word = result};
}

#include "specialforms.c"

form_t eval(form_t form, Env_t *env)
{
  switch (form.tag)
  {
  case form_word:
  {
    while (env != NULL)
    {
      for (int i = 0; i < env->len; i++)
      {
        if (strcmp(form.word, env->bindings[i].word) == 0)
        {
          return env->bindings[i].form;
        }
      }
      env = env->parent;
    }
  }
  case form_list:
  {
    const int length = form.len;
    const form_t *forms = form.forms;
    if (length == 0)
      return unit;
    const form_t first = forms[0];
    if (first.tag != form_word)
    {
      printf("Error: first element of list is not a word\n");
      exit(1);
    }
    const char *first_word = first.word;
    struct special_form *specform = in_word_set(first_word, strlen(first_word));
    if (specform == NULL)
    {
      printf("Error: unknown special form\n");
      exit(1);
    }
    const special_t specialFormValue = specform->value;
    switch (specialFormValue)
    {
    case QUOTE:
      assert(length == 2 && "quote takes exactly one argument");
      return forms[1];
    case IF:
    {
      assert(length == 4 && "if takes three arguments");
      const form_t cond = eval(forms[1], env);
      bool b = cond.tag == form_word &&
               cond.len == 1 &&
               cond.word[0] == '0';
      return eval(forms[b ? 3 : 2], env);
    }
    case LET:
    case LOOP:
    {
      assert(length >= 3 && "let and loop must have at least two arguments");
      form_t binding_form = forms[1];
      assert(binding_form.tag == form_list && "let bindings must be a list");
      const int binding_length = binding_form.len;
      assert(binding_length % 2 == 0 && "let bindings must be a list of even length");
      const form_t *binding_forms = binding_form.forms;
      Binding *bindings = malloc(sizeof(Binding) * binding_length / 2);
      Env_t new_env = {.parent = env, .len = binding_length / 2, .bindings = bindings};
      for (int i = 0; i < binding_length; i += 2)
      {
        assert(binding_forms[i].tag == form_word && "let bindings must be words");
        bindings->word = binding_forms[i].word;
        bindings->form = eval(binding_forms[i + 1], &new_env);
        bindings++;
      }
      if (specialFormValue == LET)
      {
        for (int i = 2; i < length - 1; i++)
          eval(forms[i], &new_env);
        const form_t result = eval(forms[length - 1], &new_env);
        free(bindings);
        return result;
      }
      while (true)
      {
        for (int i = 2; i < length - 1; i++)
          eval(forms[i], &new_env);
        const form_t result = eval(forms[length - 1], &new_env);
        if (result.tag == form_list &&
            result.len > 0 &&
            &result.forms[0] == &continueSpecialWord)
        {
          for (int i = 1; i < result.len; i++)
            new_env.bindings[i - 1].form = result.forms[i];
          continue;
        }
        free(bindings);
        return result;
      }
    }
    case CONT:
    {
      form_t *cont_args = malloc(sizeof(form_t) * (length));
      cont_args[0] = continueSpecialWord;
      for (int i = 1; i < length; i++)
        cont_args[i] = eval(forms[i], env);
      return (form_t){.tag = form_list, .len = length, .forms = cont_args};
    }
    default:
      printf("Error: unknown special form\n");
      exit(1);
    }

  default:
    break;
  }

    return form;
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
  form_t evaluated = eval(form, NULL);
  print_form(evaluated);
  printf("\n");
  fclose(file);
}
