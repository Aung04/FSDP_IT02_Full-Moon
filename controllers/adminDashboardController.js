const pool = require("../dbConfig");

const adminController = {
  async getDashboardMetrics(req, res) {
    try {
      const metrics = {};

      // Get top spending customers
      const topSpendersQuery = `
                SELECT 
                    p.ParentID,
                    CONCAT(p.FirstName, ' ', p.LastName) as FullName,
                    SUM(pay.PaymentAmount) as TotalSpent
                FROM Parent p
                JOIN Slot s ON p.ParentID = s.ParentID
                JOIN Payment pay ON s.SlotID = pay.SlotID
                WHERE pay.Verified = 'Verified'
                GROUP BY p.ParentID
                ORDER BY TotalSpent DESC
                LIMIT 5
            `;

      // Get most active participants
      const activeParticipantsQuery = `
                SELECT 
                    p.ParentID,
                    CONCAT(p.FirstName, ' ', p.LastName) as FullName,
                    COUNT(DISTINCT s.ProgrammeID) as ProgrammeCount
                FROM Parent p
                JOIN Slot s ON p.ParentID = s.ParentID
                GROUP BY p.ParentID
                ORDER BY ProgrammeCount DESC
                LIMIT 5
            `;

      // Get programme popularity
      const popularProgrammesQuery = `
                SELECT 
                    p.ProgrammeID,
                    p.ProgrammeName,
                    COUNT(s.SlotID) as EnrollmentCount
                FROM Programme p
                LEFT JOIN Slot s ON p.ProgrammeID = s.ProgrammeID
                GROUP BY p.ProgrammeID
                ORDER BY EnrollmentCount DESC
                LIMIT 5
            `;

      // Get revenue by month
      const monthlyRevenueQuery = `
                SELECT 
                  DATE(PaymentDate) as Date,
                  SUM(CASE WHEN Verified = 'Verified' THEN PaymentAmount ELSE 0 END) as Revenue
                FROM Payment 
                WHERE PaymentDate >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY DATE(PaymentDate)
                ORDER BY Date ASC
`;

      // Get average ratings
      const ratingsQuery = `
                SELECT 
                    p.ProgrammeID,
                    p.ProgrammeName,
                    ROUND(AVG(r.Rating), 2) as AverageRating,
                    COUNT(r.ReviewID) as ReviewCount
                FROM Programme p
                LEFT JOIN Reviews r ON p.ProgrammeID = r.ProgrammeID
                GROUP BY p.ProgrammeID
                ORDER BY AverageRating DESC
                LIMIT 5
            `;

      // Execute all queries concurrently
      const [
        topSpenders,
        activeParticipants,
        popularProgrammes,
        monthlyRevenue,
        ratings,
      ] = await Promise.all([
        pool.query(topSpendersQuery),
        pool.query(activeParticipantsQuery),
        pool.query(popularProgrammesQuery),
        pool.query(monthlyRevenueQuery),
        pool.query(ratingsQuery),
      ]);

      metrics.topSpenders = topSpenders[0];
      metrics.activeParticipants = activeParticipants[0];
      metrics.popularProgrammes = popularProgrammes[0];
      metrics.monthlyRevenue = monthlyRevenue[0];
      metrics.ratings = ratings[0];

      res.json(metrics);
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
};

module.exports = adminController;
