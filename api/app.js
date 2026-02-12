const express = require("express");
const jobRoutes = require("./routes/jobRoutes");
const { client } = require("../shared/metrics");


const app = express();

//Parse JSON
app.use(express.json());

//Routes
app.use("/jobs", jobRoutes);

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

//Port
app.listen(3000, () => {
  console.log("API Server running on port 3000");
});
