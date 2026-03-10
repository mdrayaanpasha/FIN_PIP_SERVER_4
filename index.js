import cron from "node-cron";
import express from "express";

const app = express();

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(3003, () => {
  console.log("Server is running on port 3003");
});


cron.schedule("* * * * *", () => {
  console.log("Running a task every minute");
});