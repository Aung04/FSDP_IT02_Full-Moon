const pool = require("../dbConfig");

class Programme {
    constructor(programmeID, programmeName, category, programmePicture, description) {
        this.programmeID = programmeID;
        this.programmeName = programmeName;
        this.category = category;
        this.programmePicture = programmePicture;
        this.description = description;
    }

    // Get a programme by its ID
    static async getProgrammeDetailsByID(programmeID) {
        try {
            const sqlQuery = `
                SELECT 
                    p.ProgrammeID, 
                    p.ProgrammeName, 
                    p.Category, 
                    p.ProgrammePicture, 
                    p.Description,
                    pc.Location, 
                    pc.Fee, 
                    pc.ProgrammeLevel, 
                    pc.Remarks,
                    MIN(ps.StartDateTime) AS EarliestStartDateTime, 
                    MAX(ps.EndDateTime) AS LatestEndDateTime,
                    (pc.MaxSlots - COUNT(s.SlotID)) AS SlotsLeft
                FROM Programme p
                JOIN ProgrammeClass pc ON p.ProgrammeID = pc.ProgrammeID
                JOIN ProgrammeClassBatch pcb ON pc.ProgrammeClassID = pcb.ProgrammeClassID
                JOIN ProgrammeSchedule ps ON pcb.InstanceID = ps.InstanceID
                LEFT JOIN Slot s ON pcb.InstanceID = s.InstanceID
                WHERE p.ProgrammeID = ?
                GROUP BY 
                    p.ProgrammeID, p.ProgrammeName, p.Category, p.ProgrammePicture, p.Description, 
                    pc.Location, pc.Fee, pc.ProgrammeLevel, pc.Remarks, pc.MaxSlots;
            `;
            const [rows] = await pool.query(sqlQuery, [programmeID]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error("Error in getProgrammeDetailsByID:", error);
            throw error;
        }
    }

    // Gets programmes that are 3 days away, sent to Telegram Channel
    static async getProgrammesThreeDaysAway() {
        try {
            const sqlQuery = `
                SELECT 
                    p.ProgrammeName, 
                    p.Description, 
                    pc.Location, 
                    pc.Fee, 
                    pc.ProgrammeLevel,
                    MIN(ps.StartDateTime) AS EarliestStartDateTime, 
                    MAX(ps.EndDateTime) AS LatestEndDateTime, 
                    pc.Remarks, 
                    p.ProgrammePicture,
                    (pc.MaxSlots - COUNT(s.SlotID)) AS SlotsLeft
                FROM Programme p
                JOIN ProgrammeClass pc ON p.ProgrammeID = pc.ProgrammeID
                JOIN ProgrammeClassBatch pcb ON pc.ProgrammeClassID = pcb.ProgrammeClassID
                JOIN ProgrammeSchedule ps ON pcb.InstanceID = ps.InstanceID
                LEFT JOIN Slot s ON pcb.InstanceID = s.InstanceID
                WHERE DATE(ps.StartDateTime) = DATE_ADD(CURDATE(), INTERVAL 3 DAY)
                GROUP BY 
                    p.ProgrammeName, 
                    p.Description, 
                    pc.Location, 
                    pc.Fee, 
                    pc.ProgrammeLevel, 
                    pc.Remarks, 
                    p.ProgrammePicture,
                    pc.MaxSlots
                ORDER BY EarliestStartDateTime ASC;
            `;
            const [rows] = await pool.query(sqlQuery);
            return rows;
        } catch (error) {
            console.error("Error in getProgrammesThreeDaysAway:", error);
            throw error;
        }
    }

    // Get profile picture
    static async getProfilePicture(ParentID) {
        try {
            const sqlQuery = `SELECT ProgrammePicture FROM Programme WHERE ProgrammeID = ?`;
            const [rows] = await pool.query(sqlQuery, [programmeID]);
            return rows[0].ProgrammePicture;
        } catch (error) {
            console.error("Error in getProfilePicture:", error);
            throw error;
        }
    }

    // Get all programmes
    static async getAllProgrammes() {
        try {
            const sqlQuery = `SELECT * FROM Programme`;
            const [rows] = await pool.query(sqlQuery);
            return rows.map(row => new Programme(
                row.ProgrammeID,
                row.ProgrammeName,
                row.Category,
                row.ProgrammePicture,
                row.Description
            ));
        } catch (error) {
            console.error("Error in getAllProgrammes:", error);
            throw error;
        }
    }

    // Get programme by ID with additional images
    static async getProgrammeByID(programmeID) {
        try {
            const sqlQuery = `
                SELECT 
                    p.ProgrammeID, 
                    p.ProgrammeName, 
                    p.Category, 
                    p.ProgrammePicture, 
                    p.Description,
                    pi.Image AS AdditionalImage
                FROM Programme p
                LEFT JOIN ProgrammeImages pi 
                    ON p.ProgrammeID = pi.ProgrammeID
                WHERE p.ProgrammeID = ?
            `;

            const [rows] = await pool.query(sqlQuery, [programmeID]);

            if (rows.length === 0) return null;

            const primaryData = rows[0];
            const programme = new Programme(
                primaryData.ProgrammeID,
                primaryData.ProgrammeName,
                primaryData.Category,
                primaryData.ProgrammePicture,
                primaryData.Description
            );

            programme.images = rows
                .filter(row => row.AdditionalImage)
                .map(row => row.AdditionalImage);

            return programme;
        } catch (error) {
            console.error("Error in getProgrammeByID:", error);
            throw error;
        }
    }

    // Get featured programmes
    static async getFeaturedProgrammes() {
        try {
            const sqlQuery = `
                SELECT * FROM Programme
                ORDER BY ProgrammeID DESC
                LIMIT 5;
            `;
            const [rows] = await pool.query(sqlQuery);
            return rows.map(row => new Programme(
                row.ProgrammeID,
                row.ProgrammeName,
                row.Category,
                row.ProgrammePicture,
                row.Description
            ));
        } catch (error) {
            console.error("Error in getFeaturedProgrammes:", error);
            throw error;
        }
    }

    // Get programmes by category with optional exclusion and limit
    static async getProgrammesByCategory(category, excludeProgrammeID = null, limit = null) {
        try {
            let sqlQuery = `
                SELECT * 
                FROM Programme 
                WHERE Category = ?
            `;
            const params = [category];
    
            if (excludeProgrammeID) {
                sqlQuery += ` AND ProgrammeID != ?`;
                params.push(excludeProgrammeID);
            }
    
            sqlQuery += ` ORDER BY ProgrammeID DESC`;
    
            if (limit) {
                sqlQuery += ` LIMIT ?`;
                params.push(limit);
            }
    
            const [rows] = await pool.query(sqlQuery, params);
            return rows.map(row => new Programme(
                row.ProgrammeID,
                row.ProgrammeName,
                row.Category,
                row.ProgrammePicture,
                row.Description
            ));
        } catch (error) {
            console.error("Error in getProgrammesByCategory:", error);
            throw error;
        }
    }

    // Search programmes by keyword with pagination, category filter, and total count
    static async searchProgrammes(keyword, category = "All", page = 1, limit = 6) {
        try {
            const offset = (page - 1) * limit;
    
            let sqlQuery = `
                SELECT * FROM Programme
                WHERE (ProgrammeName LIKE ? OR Description LIKE ?)
            `;
    
            let countQuery = `
                SELECT COUNT(*) AS total FROM Programme
                WHERE (ProgrammeName LIKE ? OR Description LIKE ?)
            `;
    
            const params = [`%${keyword}%`, `%${keyword}%`];
    
            if (category !== "All") {
                sqlQuery += ` AND Category = ?`;
                countQuery += ` AND Category = ?`;
                params.push(category);
            }
    
            sqlQuery += ` LIMIT ? OFFSET ?`;
            params.push(limit, offset);
    
            const [rows] = await pool.query(sqlQuery, params);
            const [[{ total }]] = await pool.query(countQuery, params.slice(0, params.length - 2));
    
            return {
                programmes: rows.map(row => new Programme(
                    row.ProgrammeID,
                    row.ProgrammeName,
                    row.Category,
                    row.ProgrammePicture,
                    row.Description
                )),
                total
            };
        } catch (error) {
            console.error("Error in searchProgrammes:", error);
            throw error;
        }
    }
    


    // Add a new programme
    static async createProgramme({ title, category, picture, description }) {
        try {
            const sqlQuery = `
                INSERT INTO Programme (ProgrammeName, Category, ProgrammePicture, Description)
                VALUES (?, ?, ?, ?)
            `;
            const [result] = await pool.query(sqlQuery, [title, category, picture, description]);
            return result.insertId;
        } catch (error) {
            console.error("Error in createProgramme:", error);
            throw error;
        }
    }

    static async updateProgramme(id, { programmeName, category, description }) {
        const sqlQuery = `
            UPDATE Programme
            SET ProgrammeName = ?, Category = ?, Description = ?
            WHERE ProgrammeID = ?
        `;
        try {
            await pool.query(sqlQuery, [programmeName, category, description, id]);
            return { message: "Programme updated successfully" };
        } catch (error) {
            console.error("Error updating programme:", error);
            throw error;
        }
    }

    static async deleteProgramme(programmeID) {
        const connection = await pool.getConnection(); // Get a database connection
        try {
            await connection.beginTransaction();
    
            // Delete related entries in the Reviews table
            await connection.query("DELETE FROM Reviews WHERE ProgrammeID = ?", [programmeID]);

            // Delete related entries in the Promotion table
            await connection.query("DELETE FROM Promotion WHERE ProgrammeID = ?", [programmeID]);
    
            // Delete ProgrammeImages associated with the programme
            await connection.query("DELETE FROM ProgrammeImages WHERE ProgrammeID = ?", [programmeID]);
    
            // Delete ProgrammeSchedules associated with the programme's classes and batches
            await connection.query(`
                DELETE ProgrammeSchedule 
                FROM ProgrammeSchedule 
                JOIN ProgrammeClassBatch ON ProgrammeSchedule.InstanceID = ProgrammeClassBatch.InstanceID
                JOIN ProgrammeClass ON ProgrammeClassBatch.ProgrammeClassID = ProgrammeClass.ProgrammeClassID
                WHERE ProgrammeClass.ProgrammeID = ?`, [programmeID]);
    
            // Delete ProgrammeClassBatch entries
            await connection.query(`
                DELETE ProgrammeClassBatch 
                FROM ProgrammeClassBatch 
                JOIN ProgrammeClass ON ProgrammeClassBatch.ProgrammeClassID = ProgrammeClass.ProgrammeClassID
                WHERE ProgrammeClass.ProgrammeID = ?`, [programmeID]);
    
            // Delete ProgrammeClass entries
            await connection.query("DELETE FROM ProgrammeClass WHERE ProgrammeID = ?", [programmeID]);
    
            // Delete the Programme itself
            await connection.query("DELETE FROM Programme WHERE ProgrammeID = ?", [programmeID]);
    
            await connection.commit();
            console.log(`Programme with ID ${programmeID} and all related data deleted successfully.`);
        } catch (error) {
            await connection.rollback();
            console.error("Error deleting programme:", error);
            throw error;
        } finally {
            connection.release();
        }
    }
    
    
}

module.exports = Programme;