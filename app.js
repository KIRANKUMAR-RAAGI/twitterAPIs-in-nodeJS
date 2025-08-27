const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const {format} = require('date-fns')

const app = express()
app.use(express.json())

const dbpath = path.join(__dirname, 'twitterClone.db')
let database = null
const initializeDBServer = async () => {
  try {
    database = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBServer()

//Middleware

const authHeaderToken = async (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401).send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'My_Secret_code', async (error, payload) => {
      if (error) {
        response.status(401).send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

//API 1 REGISTER

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const hashedPassword = await bcrypt.hash(password, 10)

  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`

  const dbUser = await database.get(selectUserQuery)

  if (dbUser === undefined) {
    const createUserQuery = `INSERT INTO 
                user(username,password,name,gender)
        VALUES ('${username}','${hashedPassword}','${name}','${gender}')`

    const dbResponse = await database.run(createUserQuery)
    const newUserId = dbResponse.lastID
    response.status(200).send('User created successfully')
  } else if (password.length < 6) {
    response.status(400).send('Password is too short')
  } else {
    response.status(400).send('User already exists')
  }
})

//API 2 LOGIN
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`
  const dbUser = await database.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status(400).send('Invalid user')
  } else {
    const isValidPassword = await bcrypt.compare(password, dbUser.password)
    if (isValidPassword) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'My_Secret_code')
      response.send({jwtToken})
    } else {
      response.status(400).send('Invalid password')
    }
  }
})
//API 3
app.get('/user/tweets/feed/', authHeaderToken, async (request, response) => {
  const getUserTweetsQuery = `
              SELECT 
                DISTINCT username,
                tweet,
                date_time AS dateTime
              FROM 
                  user
                    INNER JOIN 
                      tweet ON user.user_id = tweet.user_id
                      INNER JOIN follower ON follower.following_user_id = tweet.user_id
              ORDER BY dateTime DESC
              LIMIT 4`
  const tweetData = await database.all(getUserTweetsQuery)
  response.send(tweetData)
})
//API 4
app.get('/user/following/', authHeaderToken, async (request, response) => {
  const getUserFollowingQuery = `
                SELECT 
                    DISTINCT(name) 
                FROM 
                    user 
                      INNER JOIN 
                        follower ON user.user_id = follower.following_user_id                  
                        `
  const followingData = await database.all(getUserFollowingQuery)
  response.send(followingData)
})

//API 5
app.get('/user/followers/', authHeaderToken, async (request, response) => {
  const getUserFollowersQuery = `
                SELECT 
                    DISTINCT(name) 
                FROM 
                    user
                      INNER JOIN 
                        follower ON user.user_id = follower.follower_user_id
                        `
  const followersData = await database.all(getUserFollowersQuery)
  response.send(followersData)
})

//access to tweet
const hasAccessToTweet = async tweetId => {
  const accessQuery = `
              SELECT 
                  * 
              FROM 
                  tweet
              INNER JOIN 
                    follower ON
                      follower.following_user_id = tweet.user_id
              WHERE tweet.tweet_id = ${tweetId}
              `
  const access = await database.get(accessQuery)
  return access !== undefined
}

// API 6
app.get('/tweets/:tweetId/', authHeaderToken, async (request, response) => {
  const {tweetId} = request.params

  const access = await hasAccessToTweet(tweetId)
  if (!access) {
    response.status(401).send('Invalid Request')
  } else {
    const getTweetsQuery = `
            SELECT
                 tweet.tweet,
                 COUNT(DISTINCT like.like_id) AS likes,
                 COUNT(DISTINCT reply.reply_id) AS replies,
                 tweet.date_time AS dateTime 
            FROM
                tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id
                LEFT JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE tweet.tweet_id = ${tweetId}

                   `
    const tweetsData = await database.get(getTweetsQuery)
    response.send(tweetsData)
  }
})
//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authHeaderToken,
  async (request, response) => {
    const {tweetId} = request.params
    const access = await hasAccessToTweet(tweetId)
    if (!access) {
      response.status(401).send('Invalid Request')
    } else {
      const getLikesQuery = `
                    SELECT 
                        username
                    FROM 
                        like
                      INNER JOIN 
                          user ON like.user_id = user.user_id
                    WHERE like.tweet_id = ${tweetId}
                          `
      const likes = await database.all(getLikesQuery)
      response.send({likes: likes.map(like => like.username)})
    }
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authHeaderToken,
  async (request, response) => {
    const {tweetId} = request.params
    const access = await hasAccessToTweet(tweetId)
    if (!access) {
      response.status(401).send('Invalid Request')
    } else {
      const getLikesQuery = `
                    SELECT 
                        name,
                        reply
                    FROM 
                        reply
                      INNER JOIN 
                          user ON reply.user_id = user.user_id
                    WHERE reply.tweet_id = ${tweetId}
                          `
      const replies = await database.all(getLikesQuery)
      response.send({replies})
    }
  },
)
//API 9
app.get('/user/tweets/', authHeaderToken, async (request, response) => {
  const getTweetsQuery = `
            SELECT
                 tweet.tweet,
                 COUNT(DISTINCT like.like_id) AS likes,
                 COUNT(DISTINCT reply.reply_id) AS replies,
                 tweet.date_time AS dateTime 
            FROM
                tweet LEFT JOIN like ON tweet.tweet_id = like.tweet_id
                LEFT JOIN reply ON reply.tweet_id = tweet.tweet_id
            GROUP BY
                  tweet.tweet_id
            
                   `
  const tweetsData = await database.all(getTweetsQuery)
  response.send(tweetsData)
})
//API 10
app.post('/user/tweets/', authHeaderToken, async (request, response) => {
  const {tweet} = request.body
  //const dateTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
  const createTweetQuery = `INSERT INTO tweet(tweet) VALUES('${tweet}')`
  await database.run(createTweetQuery)
  response.send('Created a Tweet')
})
//API 11
app.delete('/tweets/:tweetId/', authHeaderToken, async (request, response) => {
  const {tweetId} = request.params
  const accessQuery = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`
  const tweet = await database.get(accessQuery)

  if (tweet === undefined) {
    response.status(401).send('Invalid Request')
  } else {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`
    await database.run(deleteTweetQuery)
    response.send('Tweet Removed')
  }
})
module.exports = app
