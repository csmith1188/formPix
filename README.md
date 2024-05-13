# formPix

FormPix is a plugin designed for Raspberry Pi to control Neopixel/ws2812 lights [formbar.js.](https://github.com/csmith1188/Formbar.js)

## Installation

- Run `npm i` in the main folder to install dependencies for both formPix and formPixSim.
- If you're on a Raspberry Pi and want to use FormPix, navigate to the `formPix` folder and run `npm i`. You may need to use `sudo` due to library requirements.
- Similarly, if you want to use FormPixSim, navigate to the `formPixSim` folder and run `npm i`.

## Usage

### Raspberry Pi
- Ensure you are on a Raspberry Pi environment.
- Utilize `sudo` with the following commands for FormPix due to library requirements.
- Run `node formPix/app.js` to execute FormPix.

### General Usage
- FormPixSim is a simulation of FormPix on a website and can be used on any platform.
- Run `node formPixSim/app.js` to execute the FormPix Simulator.

### npm Scripts
- npm scripts are tailored for Windows platforms.
- Unfortunately, npm scripts cannot be used with formPix due to npm's inability to operate with sudo. This limitation arises because one of the libraries formPix relies on requires sudo privileges for execution.
- `npm run test` executes FormPixSim.
- `npm run dev` executes FormPixSim with nodemon.
