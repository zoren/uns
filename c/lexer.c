#include <assert.h>
#include <stdio.h>
#include <string.h>
#include <stdbool.h>
#include <stdlib.h>
#include <limits.h>

typedef enum
{
  UNSET = 1,
  WORD = 'a',
  START_LIST = '[',
  END_LIST = ']',
  WHITESPACE = ' ',
} token_type;

#define BUFSIZE 8192

typedef struct
{
  FILE *file;
  char buf[BUFSIZE], *lim, *cur, *tok;
  token_type state;
  bool eof;
} FileLexerState;

FileLexerState init_lexer(FILE *file)
{
  FileLexerState st;
  st.file = file;
  st.cur = st.tok = st.buf;
  const size_t read = fread(st.buf, 1, BUFSIZE, file);
  st.lim = st.buf + read;
  st.eof = read < BUFSIZE;
  st.state = UNSET;
  return st;
}

void fill(FileLexerState *st)
{
  const ssize_t shift = st->tok - st->buf;
  const ssize_t used = st->lim - st->tok;
  const ssize_t free = BUFSIZE - used;

  assert(shift >= 1 && "fill: could not fill lexeme longer than buffer");

  memmove(st->buf, st->tok, used);
  st->lim -= shift;
  st->cur -= shift;
  st->tok -= shift;

  // Fill free space at the end of buffer with new data.
  const size_t read = fread(st->lim, 1, free, st->file);
  st->eof = read < (size_t)free;
  st->lim += read;
}

int peek_char(FileLexerState *st)
{
  if (st->lim <= st->cur && !st->eof)
    fill(st);
  if (st->lim <= st->cur)
    return -1;
  const char c = *st->cur;
  assert(c != 0 && "peek_char: cur == 0");
  return c;
}

void next_char(FileLexerState *st)
{
  if (st->lim <= st->cur && !st->eof)
    fill(st);
  assert(st->cur < st->lim && "next_char: cur >= lim");
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
  form_word = 1,
  form_list = 2,
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
    st->tok = st->cur;
    do
    {
      next_char(st);
    } while (classify_char(peek_char(st)) == WORD);
    const int len = st->cur - st->tok;
    char *word = malloc(len + 1);
    memcpy(word, st->tok, len);
    word[len] = '\0';
    return (form_t){.tag = form_word, .len = len, .word = word};
  }
  case START_LIST:
  {
    next_char(st);
    form_t *forms = NULL;
    int len = 0;
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
        break;
      }
      if (class == WHITESPACE)
      {
        next_char(st);
        continue;
      }
      forms = realloc(forms, sizeof(form_t) * (len + 1));
      forms[len++] = parse(st);
    }
    return (form_t){.tag = form_list, .len = len, .forms = forms};
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
  default:
    printf("print_form Error: unknown tag %d\n", form.tag);
    exit(1);
  }
}

const form_t unit = {.tag = form_list, .len = 0, .forms = NULL};

const form_t zero = {.tag = form_word, .len = 1, .word = "0"};
const form_t one = {.tag = form_word, .len = 1, .word = "1"};
const form_t two = {.tag = form_word, .len = 1, .word = "2"};

form_t word_from_int(int n)
{
  switch (n)
  {
  case 0:
    return zero;
  case 1:
    return one;
  case 2:
    return two;
  }
  char *result = malloc(12);
  sprintf(result, "%d", n);
  return (form_t){.tag = form_word, .len = strlen(result), .word = result};
}

const form_t continueSpecialWord = {.tag = form_word, .len = 0, .word = "*continue*"};

void assert_word_or_list(form_t a)
{
  assert(a.tag == form_word || a.tag == form_list && "tag must be word or list");
}

bool is_word(form_t a)
{
  assert_word_or_list(a);
  return a.tag == form_word;
}

bool is_list(form_t a)
{
  assert_word_or_list(a);
  return a.tag == form_list;
}

int word_to_int(form_t a)
{
  char *endptr;
  long int a_val = strtol(a.word, &endptr, 10);
  assert(*endptr == '\0' && "word_to_int requires a decimal word");
  assert(a_val <= INT_MAX && a_val >= INT_MIN && "word_to_int overflow");
  return a_val;
}

#define BUILTIN_TWO_DECIMAL_OP(name, op)            \
  form_t name(form_t a, form_t b)                   \
  {                                                 \
    const int r = word_to_int(a) op word_to_int(b); \
    return word_from_int(r);                        \
  }

BUILTIN_TWO_DECIMAL_OP(bi_add, +)
BUILTIN_TWO_DECIMAL_OP(bi_sub, -)
BUILTIN_TWO_DECIMAL_OP(bi_bit_and, &)
BUILTIN_TWO_DECIMAL_OP(bi_bit_or, |)
BUILTIN_TWO_DECIMAL_OP(bi_bit_xor, ^)
BUILTIN_TWO_DECIMAL_OP(bi_bit_shift_left, <<)
BUILTIN_TWO_DECIMAL_OP(bi_bit_shift_right, >>)

form_t bi_eq(form_t a, form_t b)
{
  assert(is_word(a) && is_word(b) && "eq requires words");
  return a.len == b.len && memcmp(a.word, b.word, a.len) == 0 ? one : zero;
}

#define BUILTIN_TWO_DECIMAL_CMP(name, op)                 \
  form_t name(form_t a, form_t b)                         \
  {                                                       \
    return word_to_int(a) op word_to_int(b) ? one : zero; \
  }

BUILTIN_TWO_DECIMAL_CMP(bi_lt, <)
BUILTIN_TWO_DECIMAL_CMP(bi_le, <=)
BUILTIN_TWO_DECIMAL_CMP(bi_ge, >=)
BUILTIN_TWO_DECIMAL_CMP(bi_gt, >)

form_t bi_is_word(form_t a)
{
  return is_word(a) ? one : zero;
}

form_t bi_is_list(form_t a)
{
  return is_list(a) ? one : zero;
}

form_t bi_size(form_t a)
{
  return word_from_int(a.len);
}

form_t bi_log(form_t a)
{
  printf("wuns: ");
  print_form(a);
  printf("\n");
  return unit;
}

form_t bi_abort()
{
  puts("wuns abort");
  exit(1);
}

form_t bi_at(form_t a, form_t b)
{
  int index = word_to_int(b);
  assert(index >= -a.len && index < a.len && "at index out of bounds");
  if (index < 0)
    index += a.len;
  if (is_list(a))
    return a.forms[index];
  assert(is_word(a) && "at requires a list or a word");
  return word_from_int(a.word[index]);
}

form_t slice(int len, const form_t *forms, int start, int end)
{
  // do it like in js https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice
  // as ousterhout says as well don't throw errors, just return empty list
  if (start >= len)
    return unit;
  if (start < -len)
    start = 0;
  else if (start < 0)
    start = len + start;

  if (end == 0 || end < -len)
    return unit;
  if (end > len)
    end = len;
  else if (end < 0)
    end = len + end;

  const int length = end - start;
  if (length <= 0)
    return unit;
  form_t *slice_forms = malloc(sizeof(form_t) * length);
  for (int i = 0; i < length; i++)
    slice_forms[i] = forms[start + i];
  return (form_t){.tag = form_list, .len = length, .forms = slice_forms};
}

form_t bi_slice(form_t v, form_t i, form_t j)
{
  assert(is_list(v) && "slice requires a list");
  const int start = word_to_int(i);
  const int end = word_to_int(j);
  return slice(v.len, v.forms, start, end);
}

form_t bi_concat(size_t n, form_t *forms)
{
  ssize_t total_length = 0;
  for (size_t i = 0; i < n; i++)
  {
    assert(is_list(forms[i]) && "concat requires lists");
    total_length += forms[i].len;
  }
  if (total_length == 0)
    return unit;
  form_t *concat_forms = malloc(sizeof(form_t) * total_length);
  int k = 0;
  for (size_t i = 0; i < n; i++)
    for (int j = 0; j < forms[i].len; j++)
      concat_forms[k++] = forms[i].forms[j];
  return (form_t){.tag = form_list, .len = total_length, .forms = concat_forms};
}

typedef struct
{
  const int parameters;
  const bool variadic;
  union
  {
    form_t (*func0)();
    form_t (*func1)(form_t);
    form_t (*func2)(form_t, form_t);
    form_t (*func3)(form_t, form_t, form_t);
    form_t (*funcvar)(size_t, form_t *);
  };
} built_in_func_t;

bool streq(const char *a, const char *b)
{
  return strcmp(a, b) == 0;
}

form_t bi_gensym()
{
  static int counter = 0;
  char *result = malloc(12);
  sprintf(result, "gensym%d", counter++);
  return (form_t){.tag = form_word, .len = strlen(result), .word = result};
}

typedef struct {
  const char *name;
  built_in_func_t func;
} built_in_func_entry_t;

static const built_in_func_entry_t built_in_funcs[] = {
  {"abort", {.parameters = 0, .func0 = bi_abort}},
  {"gensym", {.parameters = 0, .func0 = bi_gensym}},

  {"is-word", {.parameters = 1, .func1 = bi_is_word}},
  {"is-list", {.parameters = 1, .func1 = bi_is_list}},
  {"size", {.parameters = 1, .func1 = bi_size}},
  {"log", {.parameters = 1, .func1 = bi_log}},

  {"add", {.parameters = 2, .func2 = bi_add}},
  {"sub", {.parameters = 2, .func2 = bi_sub}},
  {"bit-and", {.parameters = 2, .func2 = bi_bit_and}},
  {"bit-or", {.parameters = 2, .func2 = bi_bit_or}},
  {"bit-xor", {.parameters = 2, .func2 = bi_bit_xor}},
  {"bit-shift-left", {.parameters = 2, .func2 = bi_bit_shift_left}},
  {"bit-shift-right-signed", {.parameters = 2, .func2 = bi_bit_shift_right}},

  {"eq", {.parameters = 2, .func2 = bi_eq}},
  {"lt", {.parameters = 2, .func2 = bi_lt}},
  {"le", {.parameters = 2, .func2 = bi_le}},
  {"ge", {.parameters = 2, .func2 = bi_ge}},
  {"gt", {.parameters = 2, .func2 = bi_gt}},

  {"at", {.parameters = 2, .func2 = bi_at}},

  {"slice", {.parameters = 3, .func3 = bi_slice}},

  {"concat", {.parameters = 0, .variadic = true, .funcvar = bi_concat}},
};

built_in_func_t get_builtin(const char *name)
{
  for (size_t i = 0; i < sizeof(built_in_funcs) / sizeof(built_in_func_entry_t); i++)
    if (streq(name, built_in_funcs[i].name))
      return built_in_funcs[i].func;
  return (built_in_func_t){.parameters = -1};
}

typedef struct
{
  const char *word;
  form_t form;
} Binding;

typedef struct Env
{
  const struct Env *parent;
  int len;
  const Binding *bindings;
} Env_t;

void print_env(const Env_t *env)
{
  while (env != NULL)
  {
    for (int i = 0; i < env->len; i++)
    {
      printf("print_env: %s: ", env->bindings[i].word);
      print_form(env->bindings[i].form);
      printf("\n");
    }
    env = env->parent;
  }
}

typedef struct
{
  const bool is_macro;
  const int arity;
  const char **parameters;
  const char *rest_param;
  const int n_of_bodies;
  const form_t *bodies;
} FuncMacro;

typedef struct
{
  const char *name;
  const FuncMacro func_macro;
} FuncMacroBinding;

typedef struct
{
  int len;
  FuncMacroBinding *bindings;
} FuncMacroEnv;

FuncMacroEnv func_macro_env = {
    .len = 0,
    .bindings = NULL,
};

void insert_func_macro_binding(FuncMacroBinding b)
{
  // todo handle overwriting properly
  FuncMacroBinding *new_bindings = realloc(func_macro_env.bindings, sizeof(FuncMacroBinding) * (func_macro_env.len + 1));
  memcpy(&new_bindings[func_macro_env.len], &b, sizeof(FuncMacroBinding));
  func_macro_env.len++;
  func_macro_env.bindings = new_bindings;
}

const FuncMacro *get_func_macro(const char *name)
{
  // search from the end to the beginning to get the latest definition
  for (int i = func_macro_env.len - 1; i >= 0; i--)
    if (streq(name, func_macro_env.bindings[i].name))
      return &func_macro_env.bindings[i].func_macro;
  return NULL;
}

form_t eval(form_t form, const Env_t *env)
{
  if (is_word(form))
  {
    const char *word = form.word;
    Env_t *cur_env = (Env_t *)env;
    while (cur_env != NULL)
    {
      for (int i = 0; i < cur_env->len; i++)
        if (streq(word, cur_env->bindings[i].word))
          return cur_env->bindings[i].form;
      cur_env = (Env_t *)cur_env->parent;
    }
    // to do proper error handling
    printf("Error: word not found in env %s\n", word);
    exit(1);
  }
  assert(is_list(form) && "eval requires a list at this point");

  const int length = form.len;
  if (length == 0)
    return unit;
  const form_t *forms = form.forms;
  const form_t first = forms[0];
  assert(is_word(first) && "first element a list must be a word");
  const char *first_word = first.word;
  if (streq(first_word, "quote"))
  {
    assert(length == 2 && "quote takes exactly one argument");
    return forms[1];
  }
  if (streq(first_word, "if"))
  {
    assert(length == 4 && "if takes three arguments");
    const form_t cond = eval(forms[1], env);
    bool b = is_word(cond) &&
             cond.len == 1 &&
             cond.word[0] == '0';
    return eval(forms[b ? 3 : 2], env);
  }
  bool is_let = streq(first_word, "let");
  bool is_loop = streq(first_word, "loop");
  if (is_let || is_loop)
  {
    assert(length >= 2 && "let/loop must have at least two arguments");
    form_t binding_form = forms[1];
    assert(is_list(binding_form) && "let/loop and loop bindings must be a list");
    const int binding_length = binding_form.len;
    assert(binding_length % 2 == 0 && "let/loop bindings must be a list of even length");
    const form_t *binding_forms = binding_form.forms;
    const int number_of_bindings = binding_length / 2;
    Binding *bindings = number_of_bindings == 0 ? NULL : malloc(sizeof(Binding) * number_of_bindings);
    Env_t new_env = {.parent = env, .len = 0, .bindings = bindings};
    for (int i = 0; i < binding_length; i += 2)
    {
      assert(is_word(binding_forms[i]) && "let/loop bindings must be words");
      bindings[new_env.len].word = binding_forms[i].word;
      bindings[new_env.len].form = eval(binding_forms[i + 1], &new_env);
      new_env.len++;
    }
    if (is_let)
    {
      form_t result = unit;
      for (int i = 2; i < length; i++)
        result = eval(forms[i], &new_env);
      free(bindings);
      return result;
    }
    while (true)
    {
      form_t result = unit;
      for (int i = 2; i < length; i++)
        result = eval(forms[i], &new_env);
      if (is_list(result) &&
          result.len > 0 &&
          streq(result.forms[0].word, continueSpecialWord.word))
      {
        assert(result.len - 1 == number_of_bindings && "loop bindings mismatch");
        for (int i = 0; i < number_of_bindings; i++)
        {
          const form_t v = result.forms[i + 1];
          bindings[i].form = v;
        }
        free(result.forms);
        continue;
      }
      free(bindings);
      return result;
    }
  }
  if (streq(first_word, "cont"))
  {
    form_t *cont_args = malloc(sizeof(form_t) * (length));
    cont_args[0] = continueSpecialWord;
    for (int i = 1; i < length; i++)
      cont_args[i] = eval(forms[i], env);
    return (form_t){.tag = form_list, .len = length, .forms = cont_args};
  }
  {
    const bool is_func = streq(first_word, "func");
    const bool is_macro = streq(first_word, "macro");
    if (is_func || is_macro)
    {
      assert(length >= 3 && "func/macro must have at least two arguments");
      const form_t fname = forms[1];
      assert(is_word(fname) && "func/macro name must be a word");
      const form_t params = forms[2];
      assert(is_list(params) && "func/macro params must be a list");
      const int param_length = params.len;
      for (int i = 0; i < param_length; i++)
      {
        assert(is_word(params.forms[i]) && "func/macro params must be words");
      }
      const char *rest_param = NULL;
      int arity;
      if (param_length >= 2 && streq(params.forms[param_length - 2].word, ".."))
      {
        rest_param = params.forms[param_length - 1].word;
        arity = param_length - 2;
      }
      else
      {
        arity = param_length;
      }
      const char **parameters = malloc(arity * sizeof(char *));
      for (int i = 0; i < arity; i++)
        parameters[i] = params.forms[i].word;
      form_t *bodies = malloc(sizeof(form_t) * (length - 3));
      for (int i = 3; i < length; i++)
        bodies[i - 3] = forms[i];
      FuncMacro func_macro = {
          .is_macro = is_macro,
          .arity = arity,
          .parameters = parameters,
          .rest_param = rest_param,
          .n_of_bodies = length - 3,
          .bodies = bodies,
      };
      FuncMacroBinding func_macro_binding = {.name = fname.word, .func_macro = func_macro};
      insert_func_macro_binding(func_macro_binding);
      {
        const FuncMacro *test_func_macro = get_func_macro(fname.word);
        assert(test_func_macro != NULL && "func/macro not found");
        assert(test_func_macro->arity == arity && "func/macro arity mismatch");
      }
      return unit;
    }
  }

  const int number_of_given_args = length - 1;
  const FuncMacro *func_macro = get_func_macro(first_word);
  if (func_macro == NULL)
  {
    const built_in_func_t builtin = get_builtin(first_word);
    if (builtin.parameters == -1)
    {
      printf("Error: unknown function %s\n", first_word);
      exit(1);
    }
    assert(builtin.parameters >= 0 && "builtin not found");
    if (builtin.variadic)
    {
      form_t *args = malloc(sizeof(form_t) * number_of_given_args);
      for (int i = 1; i < length; i++)
        args[i - 1] = eval(forms[i], env);
      const form_t res = builtin.funcvar(number_of_given_args, args);
      free(args);
      return res;
    }
    assert(builtin.parameters == number_of_given_args && "builtin arity mismatch");
    switch (number_of_given_args)
    {
    case 0:
      return builtin.func0();
    case 1:
      return builtin.func1(eval(forms[1], env));
    case 2:
      return builtin.func2(eval(forms[1], env), eval(forms[2], env));
    case 3:
      return builtin.func3(eval(forms[1], env), eval(forms[2], env), eval(forms[3], env));
    default:
      printf("Error: unknown builtin function %s with arity %d\n", first_word, number_of_given_args);
      exit(1);
    }
  }
  const bool is_macro = func_macro->is_macro;
  const int number_of_regular_params = func_macro->arity;
  const char *rest_param = func_macro->rest_param;
  const char **parameters = func_macro->parameters;
  int number_of_given_params;
  if (rest_param == NULL)
  {
    assert(number_of_given_args == number_of_regular_params && "func/macro call arity mismatch");
    number_of_given_params = number_of_regular_params;
  }
  else
  {
    assert(number_of_given_args >= number_of_regular_params && "func/macro call arity mismatch");
    number_of_given_params = number_of_regular_params + 1;
  }

  // eval args if func
  form_t *args = malloc(sizeof(form_t) * number_of_given_args);
  if (is_macro)
  {
    for (int i = 1; i < length; i++)
      args[i - 1] = forms[i];
  }
  else
  {
    for (int i = 1; i < length; i++)
      args[i - 1] = eval(forms[i], env);
  }

  Binding *bindings = malloc(sizeof(Binding) * number_of_given_params);
  const Env_t new_env = {.parent = env, .len = number_of_given_params, .bindings = bindings};
  for (int i = 0; i < number_of_regular_params; i++)
    bindings[i] = (Binding){.word = parameters[i], .form = args[i]};

  if (rest_param != NULL)
    bindings[number_of_regular_params] =
        (Binding){
            .word = rest_param,
            .form = slice(number_of_given_args, args, number_of_regular_params, number_of_given_args)};
  free(args);
  const form_t *bodies = func_macro->bodies;
  const int n_of_bodies = func_macro->n_of_bodies;
  form_t result;
  for (int i = 0; i < n_of_bodies; i++)
    result = eval(bodies[i], &new_env);
  free(bindings);
  if (is_macro)
    result = eval(result, env);

  return result;
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
  FileLexerState st = init_lexer(file);

  int c;
  while ((c = peek_char(&st)) >= 0)
  {
    if (classify_char(c) == WHITESPACE)
    {
      next_char(&st);
      continue;
    }
    form_t form = parse(&st);
    form_t evaluated = eval(form, NULL);
    print_form(evaluated);
    printf("\n");
  }

  fclose(file);
}
