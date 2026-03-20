import express from "express";

const router = express.Router();

router.get("/", (req, res) => {

  const query = req.query.q;

  res.json({
    query,
    results: [
      {
        fragment: "Don Bosco fundó la congregación salesiana...",
        publication: "Boletín Salesiano",
        year: 1895,
        page: 12
      }
    ]
  });

});

export default router;