const pool = require("../dbConfig");

class ChatDataModel {
    // Retrieve structured program data
    static async getStructuredProgramData() {
        try {
            const query = `
                SELECT 
                    p.ProgrammeID,
                    p.ProgrammeName,
                    p.Description,
                    p.Category,
                    c.ProgrammeClassID,
                    c.ShortDescription AS ClassDescription,
                    c.Location,
                    c.Fee,
                    c.MaxSlots,
                    c.ProgrammeLevel,
                    b.InstanceID,
                    s.ScheduleID,
                    s.StartDateTime,
                    s.EndDateTime,
                    pi.ImageID,
                    pr.PromotionID,
                    pr.PromotionName,
                    pr.DiscountType,
                    pr.DiscountValue,
                    pr.StartDateTime AS PromoStart,
                    pr.EndDateTime AS PromoEnd,
                    r.ReviewID,
                    r.Rating,
                    r.ReviewText
                FROM Programme p
                LEFT JOIN ProgrammeClass c ON p.ProgrammeID = c.ProgrammeID
                LEFT JOIN ProgrammeClassBatch b ON c.ProgrammeClassID = b.ProgrammeClassID
                LEFT JOIN ProgrammeSchedule s ON b.InstanceID = s.InstanceID
                LEFT JOIN ProgrammeImages pi ON p.ProgrammeID = pi.ProgrammeID
                LEFT JOIN Promotion pr ON p.ProgrammeID = pr.ProgrammeID
                LEFT JOIN Reviews r ON p.ProgrammeID = r.ProgrammeID;
            `;

            const [rows] = await pool.query(query);
            const programmes = {};

            rows.forEach(row => {
                if (!programmes[row.ProgrammeID]) {
                    programmes[row.ProgrammeID] = {
                        ProgrammeName: row.ProgrammeName,
                        Description: row.Description,
                        Category: row.Category,
                        Classes: []
                    };
                }

                if (row.ProgrammeClassID) {
                    const existingClass = programmes[row.ProgrammeID].Classes.find(
                        c => c.ProgrammeClassID === row.ProgrammeClassID
                    );
                    if (!existingClass) {
                        programmes[row.ProgrammeID].Classes.push({
                            ProgrammeClassID: row.ProgrammeClassID,
                            ClassDescription: row.ClassDescription,
                            Location: row.Location,
                            Fee: row.Fee,
                            MaxSlots: row.MaxSlots,
                            ProgrammeLevel: row.ProgrammeLevel,
                            Batches: []
                        });
                    }

                    if (row.InstanceID) {
                        const classObj = programmes[row.ProgrammeID].Classes.find(
                            c => c.ProgrammeClassID === row.ProgrammeClassID
                        );
                        const existingBatch = classObj.Batches.find(
                            b => b.InstanceID === row.InstanceID
                        );
                        if (!existingBatch) {
                            classObj.Batches.push({
                                InstanceID: row.InstanceID,
                                Schedules: []
                            });
                        }

                        if (row.ScheduleID) {
                            const batchObj = classObj.Batches.find(
                                b => b.InstanceID === row.InstanceID
                            );
                            batchObj.Schedules.push({
                                ScheduleID: row.ScheduleID,
                                StartDateTime: row.StartDateTime,
                                EndDateTime: row.EndDateTime
                            });
                        }
                        
                    }
                    // Add review information
                    if (row.ReviewID) {
                        if (!programmes[row.ProgrammeID].Reviews) {
                            programmes[row.ProgrammeID].Reviews = [];
                        }

                        programmes[row.ProgrammeID].Reviews.push({
                            ReviewID: row.ReviewID,
                            Rating: row.Rating,
                            ReviewText: row.ReviewText
                        });
                    }
                }
            });

            return programmes;
        } catch (error) {
            console.error("Error fetching structured chatbot data:", error);
            throw error;
        }
    }

    // Retrieve all details for a specific account
    static async getAnAccountDetails(accountID) {
        try {
            const query = `
                SELECT 
                    acc.AccountID,
                    acc.Email,
                    acc.AccountType,
                    pnt.ParentID,
                    pnt.FirstName AS ParentFirstName,
                    pnt.LastName AS ParentLastName,
                    pnt.Membership,
                    pnt.StartDate,
                    pnt.ProfileDetails AS ParentProfileDetails,
                    ch.ChildID,
                    ch.FirstName AS ChildFirstName,
                    ch.LastName AS ChildLastName,
                    ch.HealthDetails,
                    ch.ProfileDetails AS ChildProfileDetails,
                    s.SlotID,
                    s.ProgrammeID,
                    s.ProgrammeClassID,
                    pr.PromotionName,
                    r.ReviewID,
                    r.Rating,
                    r.ReviewText
                FROM Account acc
                LEFT JOIN Parent pnt ON acc.AccountID = pnt.AccountID
                LEFT JOIN Child ch ON pnt.ParentID = ch.ParentID
                LEFT JOIN Slot s ON pnt.ParentID = s.ParentID
                LEFT JOIN Programme p ON s.ProgrammeID = p.ProgrammeID
                LEFT JOIN Promotion pr ON p.ProgrammeID = pr.ProgrammeID
                LEFT JOIN Reviews r ON p.ProgrammeID = r.ProgrammeID
                WHERE acc.AccountID = ?;
            `;

            const [rows] = await pool.query(query, [accountID]);
            return rows;
        } catch (error) {
            console.error("Error fetching all details for chatbot data:", error);
            throw error;
        }
    }

    // Retrieve chat prompt based on prompt type (e.g., User, Admin, Telegram)
    static async getChatPrompt(promptType) {
        try {
            const query = `
                SELECT PromptText
                FROM ChatbotPrompts
                WHERE PromptType = ?;
            `;

            const [rows] = await pool.query(query, [promptType]);
            return rows[0]?.PromptText || null;
        } catch (error) {
            console.error("Error fetching chat prompt:", error);
            throw error;
        }
    }

    static async getPaymentDetails() {
        try {
            const query = `
                SELECT 
                    p.PaymentID,
                    p.SlotID,
                    p.PromotionID,
                    pr.PromotionName,
                    p.PaymentAmount,
                    p.PaymentDate,
                    p.PaymentMethod,
                    p.Verified,
                    p.PurchaseTier,
                    s.ProgrammeID,
                    s.ProgrammeClassID,
                    s.ParentID,
                    s.ChildID
                FROM Payment p
                LEFT JOIN Promotion pr ON p.PromotionID = pr.PromotionID
                LEFT JOIN Slot s ON p.SlotID = s.SlotID;
            `;
            const [rows] = await pool.query(query);
            return rows;
        } catch (error) {
            console.error("Error fetching payment details:", error);
            throw error;
        }
    }

    static async getSlotUtilization() {
        try {
            const query = `
                SELECT 
                    c.ProgrammeClassID,
                    c.MaxSlots,
                    COUNT(s.SlotID) AS BookedSlots,
                    (c.MaxSlots - COUNT(s.SlotID)) AS AvailableSlots,
                    c.ProgrammeID
                FROM ProgrammeClass c
                LEFT JOIN Slot s ON c.ProgrammeClassID = s.ProgrammeClassID
                GROUP BY c.ProgrammeClassID;
            `;
            const [rows] = await pool.query(query);
            return rows;
        } catch (error) {
            console.error("Error fetching slot utilization metrics:", error);
            throw error;
        }
    }

    static async getBusinessEnquiries() {
        try {
            const query = `
                SELECT 
                    * 
                FROM BusinessEnquiries;
            `;
            const [rows] = await pool.query(query);
            return rows;
        } catch (error) {
            console.error("Error fetching business enquiries:", error);
            throw error;
        }
    }

    static async getTierCriteria() {
        try {
            const query = `
                SELECT 
                    * 
                FROM TierCriteria;
            `;
            const [rows] = await pool.query(query);
            return rows;
        } catch (error) {
            console.error("Error fetching tier criteria:", error);
            throw error;
        }
    }
    
    
    // Fetch all data for admin insights (admin-side chatbot)
    static async getAllData() {
        try {
            const programData = await this.getStructuredProgramData();
            const accountQuery = `
                SELECT 
                    acc.AccountID,
                    acc.Email,
                    acc.AccountType,
                    acc.CreatedAt AS AccountCreatedAt,
                    pnt.ParentID,
                    pnt.FirstName AS ParentFirstName,
                    pnt.LastName AS ParentLastName,
                    pnt.Membership,
                    pnt.StartDate,
                    pnt.ProfileDetails AS ParentProfileDetails,
                    ch.ChildID,
                    ch.FirstName AS ChildFirstName,
                    ch.LastName AS ChildLastName,
                    ch.HealthDetails,
                    ch.ProfileDetails AS ChildProfileDetails,
                    s.SlotID,
                    s.ProgrammeID,
                    s.ProgrammeClassID,
                    pr.PromotionName,
                    r.ReviewID,
                    r.Rating,
                    r.ReviewText
                FROM Account acc
                LEFT JOIN Parent pnt ON acc.AccountID = pnt.AccountID
                LEFT JOIN Child ch ON pnt.ParentID = ch.ParentID
                LEFT JOIN Slot s ON pnt.ParentID = s.ParentID
                LEFT JOIN Programme p ON s.ProgrammeID = p.ProgrammeID
                LEFT JOIN Promotion pr ON p.ProgrammeID = pr.ProgrammeID
                LEFT JOIN Reviews r ON p.ProgrammeID = r.ProgrammeID;
            `;
            const [accountData] = await pool.query(accountQuery);
            const businessEnquiries = await this.getBusinessEnquiries();
            const paymentData = await this.getPaymentDetails();
            const tierCriteria = await this.getTierCriteria();
            const slotUtilization = await this.getSlotUtilization();
    
            return {
                programs: programData,
                accounts: accountData,
                businessEnquiries,
                payments: paymentData,
                tierCriteria,
                slotUtilization
            };
        } catch (error) {
            console.error("Error fetching all data:", error);
            throw error;
        }
    }
    
}

module.exports = ChatDataModel;
