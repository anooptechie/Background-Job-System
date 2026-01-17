const express = require("express");
const jobRoutes = require("./routes/jobRoutes");

const app = express();

//Parse JSON
app.use(express.json());

//Routes
app.use("/jobs", jobRoutes);

//Port
app.listen(3000, () => {
  console.log("API Server running on port 3000");
});
