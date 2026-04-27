const electron = require("electron");
console.log("typeof electron:", typeof electron);
console.log("electron keys:", electron && Object.keys(electron));
console.log("electron.app type:", electron && typeof electron.app);
console.log("default?", electron && typeof electron.default);
process.exit(0);
