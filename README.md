# uns - unshifted programming language

uns is a lispy programming language using primarily the characters one can reach without using the shift key

--

i made uns because i was away on vacation and my shift key broke

this should not stop you from programming

so i did what anyone would, made an unshifted programming language that doesn't require the shift key

uns uses `[]` for lists, because the more common round parantheses are not reachable without the shift key

uns uses lowercase characters, `-`, `=` and `.` for symbols

if you're lucky and have a fully functional keyboard you can use uppercase characters inside strings

strings do not provide the otherwise common escape characters eventhough backslash `\` is available without the shift key

some characters seem to unfairly be unshifted, like backtick `\`` and backslash `\\` so they are not used in uns

commas are also not allowed, i've written enough commas for a lifetime, my comma key is fine though

comments start with `;` and end at the end of the line

uns has special forms here's if:

```
[if 0 'true' 'false'] ; => 'false'
[if 1 'true' 'false'] ; => 'true' 
```
0 is false, everything else is true

you can define functions with `func`:
```
[func inc [n] [add n 1]] ; => []
[inc 1] ; => 2
```
you don't have closures or anonymous functions and function names are not values

you have local variables with `let`:
```
[let [x 1] [add x 1]] ; => 2
[let [x 1 y x] [add y 1]] ; => 2
```

instead of recursion you use `loop` and `recur`:
```
[loop [i 0 r 0]
  [if [lt i 11]
    [recur [inc i] [add i r]]
    r]] ; => 55
```

but you can still use recursion if you want:
```
[func recursive-gauss [n]
  [if [eq n 0]
    0
    [add n [recursive-gauss [dec n]]]]]
[recursive-gauss 10] ; => 55
```

at the moment you can run uns by:

```
npm install
node . # to start the repl
node . examples/demo.uns # to run a file
```
