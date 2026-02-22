# Verified Challenge Puzzles

## Daily — 25x25, 6 stars (difficulty: 100)

```
A A A A A G G G G G G G O O O O S S S S S S S S S
A A A G G G G G G H G G G O O O O O O S S S S S S
A A A A A H H G H H H L G L P O O O O O S S S S S
A A A H H H H G H H H L L L P P O O O O S S S S S
A A A A H I H H H H L L L P P P P O O P P S Y S S
A A A A H I I I H H H L P P P P P P O P Y Y Y S Y
A A A A A I I I I L L L P P P P P P P P P Y Y Y Y
A B A A A A A I I I I P P P P P P P P Q Y Y X X Y
A B A A A A I I I I I I I I P Q P Q P Q Q X X X X
B B B I I I I I I I I I I P P Q Q Q P Q Q X X X X
B B B B B C C I C M M I M M M Q Q Q Q Q X X X X X
B B C C B B C C C C M I M Q M Q Q Q Q Q Q X X X X
B C C C C C C C C C M M M Q Q Q Q Q U X X X X X X
B C C C C C C C C C M M M Q Q Q Q Q U U X X X U U
C C C C C C C C C C M M N Q R R R Q U U U U U U U
D C D D D C J C N C M M N R R R R U U U U U U W W
D C D J J J J J N N N N N R R R R V U V U U U U W
D D D J E E E J J K K N R R R R R V U V U U W U W
D D E E E E J J K K K N R R R R R V V V V U W W W
D D E E E E E J K J K N R K R R R V W W V V W W W
E E E E E E J J J J K N K K K R R V W W W W W W W
E E E F E E F J F J K K K K K R R V V W W W W W W
E E E F F E F F F K K K K K K K K T V T W W W W W
F E F F F F F K F K K K K K K K K T T T W W W W W
F F F F K K K K K K K K K K K T T T T T T T T T W
```

Solver command:
```
echo "<grid above>" | npx tsx src/sieve/cli.ts --stars 6
```

Result: SOLVED in 0.80s, difficulty 100

## Weekly — 21x21, 5 stars (difficulty: 100)

```
A A A B B B B B B B B B B C C D D D D D E
F A A A A A B B B B B C C C C D E E E D E
F A F A G G G B B B B B B C D D E E E E E
F F F G G G G G B B B C C C D E E E E E E
F F F G G H H G B B B B C E D E I E E E E
F F F F G H H H B B J J C E E E I E E E E
F F F F G H H H B B B J J J J I I E E E E
F F F G G H H H B B J J J J I I E E E E E
F F F F G H H H H J J J J J I I I K K K E
L H F F F H M M M J N N J I I K K K K K E
L H H F F H H M N N N N N I O O K K K K K
L H H H H H M M N N N N N I I O K K K K K
L H H H M M M P P P N N O O O O O O K K K
L H H H M Q Q P R P P N P P O O O O K K S
L H H H M Q Q Q R R P N P T O O O O K S S
L H H H M Q Q R R R P P P T O O O O O S S
L L Q M M Q Q R T R T P T T O O O S S S S
Q L Q Q Q Q R R T R T P T T O O O S S S S
Q L Q Q Q R R T T T T T T U O O O O S S S
Q Q Q Q Q T T T T T T T U U U U U S S S S
Q Q Q Q Q Q T T T T T T U U U U U U U U U
```

Solver command:
```
echo "<grid above>" | npx tsx src/sieve/cli.ts --stars 5
```

Result: SOLVED in 1.06s, difficulty 100

## Monthly — 17x17, 4 stars (difficulty: 76)

```
A A A A B B B B B B B C C C D D D
A A A A A A B E B E C C C C C F D
A A A A A E E E B E E E C E C F D
A A A A A A E E B E E E E E F F D
G A A A H H E E E E E E E E E F D
G A H H H H H I I I J E E E E F D
G G G H H H H H I I J E E F F F F
G G K K H H H H I I J J F F F F F
L G G K K H K I I I I J F F F F F
L L K K K K K I I I I J F F F F F
L K K K K K K K K M I J F F F N F
L K K K O K M K M M M J F F F N F
L K K O O O M M M M M M F F N N N
L L L O O O M M M M M M F F F N N
L L O O O O O O O M M M M P F N P
L L L L L O O Q O Q M P P P F F P
L L L Q Q Q Q Q Q Q Q Q P P P P P
```

Solver command:
```
echo "<grid above>" | npx tsx src/sieve/cli.ts --stars 4
```

Result: SOLVED in 0.14s, difficulty 76
