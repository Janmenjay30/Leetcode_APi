const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const NodeCache = require('node-cache');

const app = express();
app.use(cors());
const PORT = 3000;
const statsCache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Helper function to fetch LeetCode stats via GraphQL
async function getLeetCodeStats(username) {
    const graphqlQuery = {
        query: `
            query getUserProfile($username: String!) {
                allQuestionsCount {
                    difficulty
                    count
                }
                matchedUser(username: $username) {
                    username
                    submitStats {
                        acSubmissionNum {
                            difficulty
                            count
                            submissions
                        }
                    }
                    profile {
                        ranking
                    }
                }
            }
        `,
        variables: { username }
    };

    try {
        const response = await axios.post('https://leetcode.com/graphql', graphqlQuery);
        return response.data.data;
    } catch (error) {
        console.error('GraphQL error:', error);
        return null;
    }
}

// Function to get recent submissions
async function getRecentSubmissions(username) {
    const graphqlQuery = {
        query: `
            query getRecentSubmissions($username: String!) {
                recentSubmissionList(username: $username, limit: 1000) {
                    title
                    titleSlug
                    timestamp
                    statusDisplay
                    lang
                }
            }
        `,
        variables: { username }
    };

    try {
        const response = await axios.post('https://leetcode.com/graphql', graphqlQuery);
        return response.data.data.recentSubmissionList || [];
    } catch (error) {
        console.error('Error fetching submissions:', error);
        return [];
    }
}

// Calculate time-based stats
function calculateTimeBasedStats(submissions) {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    
    let daily = 0, weekly = 0, monthly = 0;
    
    submissions.forEach(sub => {
        const subDate = new Date(parseInt(sub.timestamp) * 1000);
        if (sub.statusDisplay === 'Accepted') {
            if (subDate > oneDayAgo) daily++;
            if (subDate > oneWeekAgo) weekly++;
            if (subDate > oneMonthAgo) monthly++;
        }
    });
    
    return { daily, weekly, monthly };
}

// API endpoint
app.get('/stats/:username', async (req, res) => {
    const { username } = req.params;
    
    // Check cache first
    const cachedStats = statsCache.get(username);
    if (cachedStats) {
        return res.json(cachedStats);
    }

    try {
        const data = await getLeetCodeStats(username);
        if (!data || !data.matchedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const totalSolved = data.matchedUser.submitStats.acSubmissionNum[0].count;
        const ranking = data.matchedUser.profile.ranking;
        
        const submissions = await getRecentSubmissions(username);
        const timeStats = calculateTimeBasedStats(submissions);

        const responseData = {
            username,
            totalSolved,
            ranking,
            solvedLastDay: timeStats.daily,
            solvedLastWeek: timeStats.weekly,
            solvedLastMonth: timeStats.monthly,
        };

        // Cache the response
        statsCache.set(username, responseData);
        
        res.json(responseData);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});