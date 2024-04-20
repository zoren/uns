
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

const form_t zero = {.tag = form_word, .len = 1, .word = "0"};
const form_t one = {.tag = form_word, .len = 1, .word = "1"};
const form_t two = {.tag = form_word, .len = 1, .word = "2"};

form_t word_from_int(int n)
{
  switch(n)
  {
    case 0: return zero;
    case 1: return one;
    case 2: return two;
  }
  char *result = malloc(12);
  sprintf(result, "%d", n);
  return (form_t){.tag = form_word, .len = strlen(result), .word = result};
}

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

form_t eq(form_t a, form_t b)
{
  assert(a.tag == form_word && b.tag == form_word && "eq requires words");
  return a.len == b.len && memcmp(a.word, b.word, a.len) == 0 ? one : zero;
}

#define BUILTIN_TWO_DECIMAL_OP(name, op)                                             \
  form_t name(form_t a, form_t b)                                                    \
  {                                                                                  \
    assert(isDecimalWord(a) && isDecimalWord(b) && #name " requires decimal words"); \
    const int r = atoi(a.word) op atoi(b.word);                                      \
    return word_from_int(r);                                                         \
  }

BUILTIN_TWO_DECIMAL_OP(add, +)
BUILTIN_TWO_DECIMAL_OP(sub, -)

#define BUILTIN_TWO_DECIMAL_CMP(name, op)                                            \
  form_t name(form_t a, form_t b)                                                    \
  {                                                                                  \
    assert(isDecimalWord(a) && isDecimalWord(b) && #name " requires decimal words"); \
    return atoi(a.word) op atoi(b.word) ? one : zero;                                \
  }

BUILTIN_TWO_DECIMAL_CMP(lt, <)
BUILTIN_TWO_DECIMAL_CMP(le, <=)
BUILTIN_TWO_DECIMAL_CMP(ge, >=)
BUILTIN_TWO_DECIMAL_CMP(gt, >)

form_t is_word(form_t a)
{
  return a.tag == form_word ? one : zero;
}

form_t is_list(form_t a)
{
  return a.tag == form_list ? one : zero;
}

form_t size(form_t a)
{
  assert(a.tag == form_list && "size requires a list");
  return word_from_int(a.len);
}

form_t at(form_t a, form_t b)
{
  assert(a.tag == form_list && "at requires a list");
  assert(isDecimalWord(b) && "at requires a decimal word");
  const int index = atoi(b.word);
  assert(index >= 0 && index < a.len && "at index out of bounds");
  return a.forms[index];
}

form_t slice(form_t v, form_t i, form_t j)
{
  assert(v.tag == form_list && "slice requires a list");
  assert(isDecimalWord(i) && "slice requires a decimal word");
  assert(isDecimalWord(j) && "slice requires a decimal word");
  const int start = atoi(i.word);
  const int end = atoi(j.word);
  assert(start >= 0 && start < v.len && "slice start index out of bounds");
  assert(end >= 0 && end < v.len && "slice end index out of bounds");
  assert(start <= end && "slice start index must be less than or equal to end index");
  const int length = end - start;
  if (length == 0)
    return unit;
  form_t *forms = malloc(sizeof(form_t) * length);
  for (int i = 0; i < length; i++)
  {
    forms[i] = v.forms[start + i];
  }
  return (form_t){.tag = form_list, .len = length, .forms = forms};
}

typedef struct
{
  const char *name;
  form_t (*func)(form_t);
} built_in_func1_t;

const built_in_func1_t built_in_funcs1[] = {
    {"is-word", is_word},
    {"is-list", is_list},
    {"size", size},
};

typedef struct
{
  const char *name;
  form_t (*func)(form_t, form_t);
} built_in_func2_t;

const built_in_func2_t built_in_funcs2[] = {
    {"eq", eq},
    {"add", add},
    {"sub", sub},
    {"lt", lt},
    {"le", le},
    {"ge", ge},
    {"gt", gt},
    {"at", at},
};

typedef struct
{
  const char *name;
  form_t (*func)(form_t, form_t, form_t);
} built_in_func3_t;

const built_in_func3_t built_in_funcs3[] = {
    {"slice", slice},
};

form_t call_builtin(const char *name, const struct form *args, const int count)
{
  switch (count)
  {
  case 1:
    for (int i = 0; i < sizeof(built_in_funcs1) / sizeof(built_in_funcs1[0]); i++)
    {
      if (strcmp(name, built_in_funcs1[i].name) == 0)
      {
        return built_in_funcs1[i].func(args[0]);
      }
    }
    break;
  case 2:
    for (int i = 0; i < sizeof(built_in_funcs2) / sizeof(built_in_funcs2[0]); i++)
    {
      if (strcmp(name, built_in_funcs2[i].name) == 0)
      {
        return built_in_funcs2[i].func(args[0], args[1]);
      }
    }
    break;
  case 3:
    for (int i = 0; i < sizeof(built_in_funcs3) / sizeof(built_in_funcs3[0]); i++)
    {
      if (strcmp(name, built_in_funcs3[i].name) == 0)
      {
        return built_in_funcs3[i].func(args[0], args[1], args[2]);
      }
    }
    break;
  }
  printf("Error: unknown builtin function %s with arity %d\n", name, count);
  exit(1);
}

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
    if (strcmp(first_word, "quote") == 0)
    {
      assert(length == 2 && "quote takes exactly one argument");
      return forms[1];
    }
    if (strcmp(first_word, "if") == 0)
    {
      assert(length == 4 && "if takes three arguments");
      const form_t cond = eval(forms[1], env);
      bool b = cond.tag == form_word &&
               cond.len == 1 &&
               cond.word[0] == '0';
      return eval(forms[b ? 3 : 2], env);
    }
    bool is_let = strcmp(first_word, "let") == 0;
    bool is_loop = strcmp(first_word, "loop") == 0;
    if (is_let || is_loop)
    {
      assert(length >= 3 && "let/loop must have at least two arguments");
      form_t binding_form = forms[1];
      assert(binding_form.tag == form_list && "lelet/loopt and loop bindings must be a list");
      const int binding_length = binding_form.len;
      assert(binding_length % 2 == 0 && "let/loop bindings must be a list of even length");
      const form_t *binding_forms = binding_form.forms;
      Binding *bindings = malloc(sizeof(Binding) * binding_length / 2);
      Env_t new_env = {.parent = env, .len = binding_length / 2, .bindings = bindings};
      for (int i = 0; i < binding_length; i += 2)
      {
        assert(binding_forms[i].tag == form_word && "let/loop bindings must be words");
        bindings->word = binding_forms[i].word;
        bindings->form = eval(binding_forms[i + 1], &new_env);
        bindings++;
      }
      if (is_let)
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
    if (strcmp(first_word, "cont") == 0)
    {
      form_t *cont_args = malloc(sizeof(form_t) * (length));
      cont_args[0] = continueSpecialWord;
      for (int i = 1; i < length; i++)
        cont_args[i] = eval(forms[i], env);
      return (form_t){.tag = form_list, .len = length, .forms = cont_args};
    }
    const bool is_func = strcmp(first_word, "func") == 0;
    const bool is_macro = strcmp(first_word, "macro") == 0;
    if (is_func || is_macro)
    {
      printf("Error: func/macro not implemented\n");
      exit(1);
    }
    form_t *args = malloc(sizeof(form_t) * (length - 1));
    for (int i = 1; i < length; i++)
    {
      args[i - 1] = eval(forms[i], env);
    }
    return call_builtin(first_word, args, length - 1);

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
