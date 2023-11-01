# Moat Maker for CommonJS

This is a CommonJS-compatible version of Moat Maker. The main Moat Maker repository can be found over [here](https://github.com/theScottyJam/moat-maker).

A quick recap on CommonJS vs ES Modules: CommonJS is Node's default module system where you use `require()` to import stuff. "ES Modules" are the newer, standard module system where you use `import ... from ...` syntax to import stuff. If you're using TypeScript, you may be writing your code with ES Module syntax, but TypeScript is secretly transpiling your code down to CommonJS. You can check your transpiled output to see what module system it will use. If you get errors such as "require() of ES Module ... from ... not supported." when running a project, it likely means you're using CommonJS while trying to import a package (such as Moat-Maker) that's built with ES Modules.

If you're using CommonJS and wish to use Moat-Maker, simply install this package (`npm i moat-maker-commonjs`) instead of the main moat-maker project and you should be good to go.

## How supported is this package?

You can expect this CommonJS version of Moat Maker to be updated less frequently. It will occasionally receive some of the more important updates, but minor changes or small bug fixes may not be brought over for a while. What's more, it's possible that support for this package may be dropped eventually. At the moment, creating a CommonJS version of the project is fairly easy to do - it just takes a couple config tweaks and it works. However, CommonJS and ES Modules are not interchangeable - there is an ever-growing set of features provided by ES Modules that is simply not supported by CommonJS. If there is ever a need to use one of these incompatible features, it may mean the end of support for this CommonJS project. Finally, it's also important to note that the algorithm being used to transpile from ES Modules to CommonJS isn't perfect. While unlikely, it's possible that differences in behaviors or bugs could crop up in this repo due to transpiling errors.

All that being said, this package is still considered production-ready. If your project hasn't yet converted to ES Modules, feel free to use this package until you're ready to make the plunge into ES Modules.

## Why not make the main Moat-Maker project support both CommonJS and ES Modules?

Many NPM packages are capable of simply supporting both CommonJS and ES Modules. This dual-support is usually accomplished by bundling both a CommonJS and an ES Module version of the project into the same NPM package, doubling the size of the package and creating lots of unnecessary bloat. Providing strong support for both versions also prevents the use of some of the features ES Modules has to offer, since those features are simply not compatible with CommonJS.

Because Moat Maker is a fairly newer project that doesn't have a CommonJS history to it, it made sense to keep CommonJS out of the main repo.
