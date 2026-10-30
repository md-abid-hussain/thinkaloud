---
id: interactive
name: Interactive
teaches: Programs driven by a person in real time, such as games and editors (Pong, Tetris, a text editor).
runs_as: interactive
oracle: none
---

## What this type teaches

- **The loop:** read input, update the state, draw, repeat; fixed or variable time steps.
- **State and rendering kept apart,** so the game or document can be tested and redrawn.
- **Input handling:** key events, raw terminal mode, debouncing.
- **Time:** speed tied to elapsed time, not to the frame rate.
- **Structures for the domain:** a grid, collision checks, a gap buffer or rope for text.

## Not this

- Graphics library APIs.
- Art, sound or menus.

## Stage 0

- **What:** what the player or user does, and what the program must keep track of.
- **Why:** what building it teaches beyond the game itself: loops, state, time.
- **How:** how you'd structure one tick of the loop.

## Step questions

Shapes that work:
- The program runs on a faster or slower machine.
- Two events arrive in the same frame.
- The state gets large: a long document, many objects.

Example (Tetris, the falling-piece step):
- **Question:** On a faster computer your pieces fall twice as fast. What is your movement tied to, and how do you make
  the speed the same on every machine?
- **looks_for:** movement happens per frame, and the frame rate depends on the machine · use the elapsed time, or a
  fixed time step · keep updating the state separate from drawing

## Check

- **No automatic check.** A step is done when the explanation is accepted and the diff review finds the step's
  behaviour in the code.
