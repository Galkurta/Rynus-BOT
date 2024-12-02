const fs = require("fs");
const axios = require("axios");
const colors = require("./config/colors");
const logger = require("./config/logger");
const displayBanner = require("./config/banner");
const CountdownTimer = require("./config/countdown");

// API Configuration
const API_CONFIG = {
  BASE_URL: "https://cloud.rynus.io",
  ORIGINS: {
    API: "https://cloud.rynus.io",
    WEBAPP: "https://tele-app.rynus.io",
  },
  ENDPOINTS: {
    USER_INFO: "/api/user/get-info-by-telegram-id",
    MISSIONS_LIST: "/api/user-mission/get-user-missions",
    EXECUTE_MISSION: "/api/user-mission/execute-missions",
    UPDATE_MISSION: "/api/user-mission/update-missions-status",
    LABELING_TASK: "/api/user-label-task/create-user-label-task",
    HEARTBEAT: "/api/user/update-user-last-heart-beat",
  },
};

// Request Configuration
const REQUEST_CONFIG = {
  DELAY: 2000,
  HEADERS: {
    BROWSER:
      '"Microsoft Edge";v="131", "Chromium";v="131", "Not_A_Brand";v="24"',
    USER_AGENT:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },
};

// Mission Configuration
const MISSION_CONFIG = {
  DAILY_CHECK_IN_ID: 1,
  STATUS: {
    PENDING: "0",
    COMPLETED: "3",
    COMPLETED_TODAY: "4",
  },
};

// Labeling Configuration
const LABELING_CONFIG = {
  MAX_TASKS: 100,
  POWER_REQUIRED: 1,
  POWER_RECOVERY_TIME: 1.2,
  TASK_TEMPLATE: {
    taskId: 770,
    data: [
      {
        words: [
          {
            id: 28,
            word: "GPU/CPU",
          },
        ],
        topic: "hw",
        groupId: 173312214557,
      },
      {
        words: [
          {
            id: 26,
            word: "Rynus",
          },
        ],
        topic: "ORG",
        groupId: 173312214284,
      },
    ],
  },
  TASK_STATUS: 2,
  TASK_TYPE: 2,
};

class Rynus {
  constructor() {
    this.accounts = new Map();
    this.userLevels = new Map();
  }

  async loadUserLevels() {
    try {
      // Set default values directly since API call fails
      const defaultLevels = [
        { id: 1, name: "Bronze I", reward: 2500, energy: 20 },
        { id: 2, name: "Bronze II", reward: 2550, energy: 22 },
        { id: 11, name: "Bronze III", reward: 2600, energy: 24 },
        { id: 3, name: "Silver I", reward: 2625, energy: 30 },
        { id: 4, name: "Silver II", reward: 2750, energy: 32 },
        { id: 12, name: "Silver III", reward: 2875, energy: 34 },
        { id: 5, name: "Gold I", reward: 3000, energy: 40 },
        { id: 6, name: "Gold II", reward: 3125, energy: 45 },
        { id: 13, name: "Gold III", reward: 3250, energy: 50 },
        { id: 7, name: "Platinum I", reward: 3500, energy: 60 },
        { id: 8, name: "Platinum II", reward: 3500, energy: 70 },
        { id: 14, name: "Platinum III", reward: 3500, energy: 80 },
        { id: 9, name: "Diamond", reward: 3750, energy: 100 },
        { id: 10, name: "Trusted", reward: 3750, energy: 200 },
      ];

      defaultLevels.forEach((level) => {
        this.userLevels.set(level.id, {
          id: level.id,
          name: level.name,
          levelCode: level.name.replace(" ", "_"),
          maximumEnergy: level.energy,
          textTaskPoint: level.reward,
          groups: level.name.split(" ")[0],
        });
      });
    } catch (error) {
      logger.error("Error in level configuration:", error.message);
    }
  }

  calculateNextCycleTime(maxEnergy) {
    const minutesNeeded = maxEnergy * LABELING_CONFIG.POWER_RECOVERY_TIME;
    return minutesNeeded * 60;
  }

  async loadAccounts() {
    try {
      const data = await fs.promises.readFile("data.txt", "utf8");
      const lines = data.split("\n");

      for (const line of lines) {
        if (line.trim()) {
          const userData = line.trim();
          const telegramId = this.extractTelegramId(userData);
          const username = this.extractUsername(userData);
          if (telegramId) {
            this.accounts.set(telegramId, { userData, telegramId, username });
          }
        }
      }
      logger.success(`Loaded ${this.accounts.size} accounts successfully`);
    } catch (error) {
      logger.error("Error loading accounts:", error.message);
    }
  }

  extractTelegramId(userData) {
    const match = userData.match(/%22id%22%3A(\d+)%2C/);
    return match ? match[1] : null;
  }

  extractUsername(userData) {
    const match = userData.match(/%22username%22%3A%22([^%]+)%22/);
    return match ? match[1] : null;
  }

  getLevelInfo(levelId) {
    const levelInfo = this.userLevels.get(Number(levelId));
    if (!levelInfo) {
      return {
        id: levelId,
        name: "Unknown Level",
        maximumEnergy: 200,
        textTaskPoint: 3750,
        groups: "Unknown",
      };
    }
    return levelInfo;
  }

  async getUserInfo(account) {
    try {
      const response = await axios.get(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_INFO}`,
        {
          params: {
            telegramId: account.telegramId,
            referralCode: "6944804952",
          },
          headers: {
            ...this.getHeaders(account),
            "X-Telegram-Miniapp-Auth": account.userData,
          },
        }
      );
      return response.data.data.userData;
    } catch (error) {
      logger.error("Error getting user info:", error.message);
      return null;
    }
  }

  async getMissionsList(account, userInfo) {
    try {
      const response = await axios.get(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.MISSIONS_LIST}`,
        {
          params: {
            userId: userInfo.id,
          },
          headers: this.getHeaders(account),
        }
      );
      return response.data.data;
    } catch (error) {
      logger.error("Error getting missions list:", error.message);
      return [];
    }
  }

  async displayUserInfo(userInfo, account) {
    const levelInfo = this.getLevelInfo(userInfo.levelId);

    logger.info(
      `${colors.accountInfo}=== Account Information ===${colors.reset}`
    );
    logger.info(`${colors.accountInfo}User ID: ${userInfo.id}${colors.reset}`);
    logger.info(
      `${colors.accountName}Username: ${account.username}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}User Code: ${userInfo.userCode}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}Region: ${userInfo.region}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}Current Balance: ${userInfo.balance}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}Extra Balance Rental: ${userInfo.extraBalanceRental}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}Total Completed Tasks: ${userInfo.completedTasks}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}User Power: ${userInfo.userPower}/${levelInfo.maximumEnergy}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}User Role: ${userInfo.userRole}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}Level: ${levelInfo.name} (${levelInfo.groups})${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}Task Reward: ${levelInfo.textTaskPoint}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}===========================${colors.reset}`
    );
  }

  getHeaders(account) {
    return {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Content-Type": "application/json",
      Origin: API_CONFIG.ORIGINS.WEBAPP,
      Referer: `${API_CONFIG.ORIGINS.WEBAPP}/`,
      "X-Telegram-Miniapp-Auth": account.userData,
      "Sec-Ch-Ua": REQUEST_CONFIG.HEADERS.BROWSER,
      "User-Agent": REQUEST_CONFIG.HEADERS.USER_AGENT,
    };
  }

  async executeMission(account, userInfo, mission) {
    try {
      if (mission.id !== MISSION_CONFIG.DAILY_CHECK_IN_ID) {
        logger.info(
          `${colors.taskWaiting}Skipping non-daily mission: ${mission.name}${colors.reset}`
        );
        return;
      }

      switch (mission.missionStatus) {
        case MISSION_CONFIG.STATUS.COMPLETED:
          logger.info(
            `${colors.taskComplete}Mission "${mission.name}" already completed${colors.reset}`
          );
          return;
        case MISSION_CONFIG.STATUS.COMPLETED_TODAY:
          logger.info(
            `${colors.taskComplete}Daily mission "${mission.name}" already completed today${colors.reset}`
          );
          return;
        case MISSION_CONFIG.STATUS.PENDING:
          break;
        default:
          logger.info(
            `${colors.taskWaiting}Mission "${mission.name}" status: ${mission.missionStatus}${colors.reset}`
          );
          return;
      }

      await axios.post(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.EXECUTE_MISSION}/${mission.id}/${userInfo.userCode}`,
        {
          umId: mission.id,
          userId: userInfo.userCode,
        },
        { headers: this.getHeaders(account) }
      );

      await this.delay(REQUEST_CONFIG.DELAY);

      await axios.post(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.UPDATE_MISSION}/${mission.id}/${userInfo.userCode}`,
        {
          umId: mission.id,
          userId: userInfo.userCode,
        },
        { headers: this.getHeaders(account) }
      );

      const updatedMissions = await this.getMissionsList(account, userInfo);
      const updatedMission = updatedMissions.find((m) => m.id === mission.id);

      if (updatedMission) {
        switch (updatedMission.missionStatus) {
          case MISSION_CONFIG.STATUS.COMPLETED_TODAY:
            logger.success(`Daily check-in completed for today`);
            break;
          default:
            logger.info(
              `${colors.taskInProgress}Mission status updated to: ${updatedMission.missionStatus}${colors.reset}`
            );
        }
      }
    } catch (error) {
      logger.error(`Error executing mission ${mission.id}:`, error.message);
    }
  }

  async executeAllMissions(account, userInfo) {
    try {
      const missions = await this.getMissionsList(account, userInfo);

      logger.info(
        `${colors.menuTitle}=== Executing Missions ===${colors.reset}`
      );
      for (const mission of missions) {
        logger.info(
          `${colors.menuOption}Processing mission: ${mission.name}${colors.reset}`
        );
        await this.executeMission(account, userInfo, mission);
        await this.delay(REQUEST_CONFIG.DELAY);
      }
      logger.success("=== All Missions Processed ===");
    } catch (error) {
      logger.error("Error executing missions:", error.message);
    }
  }

  async performLabeling(account, userInfo) {
    try {
      logger.info(
        `${colors.menuTitle}=== Starting Labeling Tasks ===${colors.reset}`
      );
      let nextKey = null;
      const levelInfo = this.getLevelInfo(userInfo.levelId);
      let currentPower = userInfo.userPower;
      let taskCount = 0;
      let initialBalance = userInfo.extraBalanceRental;
      let currentBalance = initialBalance;
      let noTaskRetries = 0;
      const MAX_RETRIES = 3;

      logger.info(
        `${colors.accountInfo}Initial Balance: ${initialBalance}${colors.reset}`
      );
      logger.info(
        `${colors.accountInfo}Initial Power: ${currentPower}/${levelInfo.maximumEnergy}${colors.reset}`
      );

      while (
        taskCount < LABELING_CONFIG.MAX_TASKS &&
        currentPower >= LABELING_CONFIG.POWER_REQUIRED
      ) {
        try {
          const payload = {
            authData: account.userData,
            labelResult: JSON.stringify(LABELING_CONFIG.TASK_TEMPLATE),
            nextKey: nextKey,
            reward: levelInfo.textTaskPoint,
            taskId: 0,
            taskStatus: LABELING_CONFIG.TASK_STATUS,
            taskType: LABELING_CONFIG.TASK_TYPE,
            userId: userInfo.id,
          };

          const response = await axios.post(
            `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.LABELING_TASK}`,
            payload,
            { headers: this.getHeaders(account) }
          );

          if (response.data?.data?.taskResult) {
            nextKey = response.data.data.taskResult.nextKey || null;
            currentBalance = response.data.data.taskResult.bonusBalance;
            taskCount++;
            currentPower -= LABELING_CONFIG.POWER_REQUIRED;
            noTaskRetries = 0; // Reset retry counter on successful task

            logger.success(`Completed labeling task ${taskCount}`);
            logger.info(
              `${colors.accountInfo}Current Balance: ${currentBalance} (+${
                currentBalance - initialBalance
              })${colors.reset}`
            );
            logger.info(
              `${colors.accountInfo}Remaining Power: ${currentPower}/${levelInfo.maximumEnergy}${colors.reset}`
            );
          } else {
            noTaskRetries++;
            if (noTaskRetries >= MAX_RETRIES) {
              logger.warn("No tasks available after multiple retries");
              break;
            }
            logger.warn(
              `No tasks available, retrying in 10 seconds... (Attempt ${noTaskRetries}/${MAX_RETRIES})`
            );
            await this.delay(10000); // Wait 10 seconds before retry
          }

          await this.delay(REQUEST_CONFIG.DELAY);
        } catch (error) {
          logger.error("Error in labeling task:", error.message);
          noTaskRetries++;
          if (noTaskRetries >= MAX_RETRIES) {
            logger.error("Max retry attempts reached, stopping labeling");
            break;
          }
          await this.delay(5000); // Wait 5 seconds before retry after error
        }
      }

      if (currentPower >= LABELING_CONFIG.POWER_REQUIRED) {
        logger.warn(
          `Stopped with ${currentPower}/${levelInfo.maximumEnergy} power remaining due to no available tasks`
        );
      } else {
        logger.info(
          `Finished labeling with ${currentPower}/${levelInfo.maximumEnergy} power remaining`
        );
      }

      return this.getUserInfo(account);
    } catch (error) {
      logger.error("Error in labeling:", error.message);
      return userInfo;
    }
  }

  async updateHeartbeat(account, userInfo) {
    try {
      await axios.put(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.HEARTBEAT}?userId=${userInfo.id}`,
        {},
        { headers: this.getHeaders(account) }
      );
    } catch (error) {
      logger.error(`Error updating heartbeat:`, error.message);
    }
  }

  async delay(ms) {
    const timer = new CountdownTimer({
      message: "Waiting: ",
      format: "HH:MM:SS",
    });
    await timer.start(ms / 1000);
  }

  async startAutomation() {
    displayBanner();
    await this.loadUserLevels();

    while (true) {
      try {
        await this.loadAccounts();
        logger.info(
          `${colors.menuTitle}Starting new automation cycle${colors.reset}`
        );

        for (const account of this.accounts.values()) {
          try {
            logger.info(
              `${colors.accountName}Starting automation for user ${account.username}${colors.reset}`
            );
            const userInfo = await this.getUserInfo(account);

            if (userInfo) {
              await this.displayUserInfo(userInfo, account);
              await this.executeAllMissions(account, userInfo);
              await this.delay(REQUEST_CONFIG.DELAY);
              await this.updateHeartbeat(account, userInfo);
              await this.delay(REQUEST_CONFIG.DELAY);

              const updatedUserInfo = await this.performLabeling(
                account,
                userInfo
              );

              if (updatedUserInfo) {
                logger.info(
                  `${colors.menuTitle}=== Final Account Status ===${colors.reset}`
                );
                await this.displayUserInfo(updatedUserInfo, account);
              }
            }
          } catch (error) {
            logger.error(
              `Error processing account ${account.username}:`,
              error.message
            );
          }
        }

        // Get max energy of last processed account for next cycle timing
        const lastUserInfo = Array.from(this.accounts.values()).pop();
        const userInfo = await this.getUserInfo(lastUserInfo);
        const levelInfo = this.getLevelInfo(userInfo.levelId);
        const nextCycleTime = this.calculateNextCycleTime(
          levelInfo.maximumEnergy
        );

        logger.info(
          `${colors.menuTitle}All accounts processed. Waiting ${Math.round(
            nextCycleTime / 60
          )} minutes for energy recovery...${colors.reset}`
        );
        const timer = new CountdownTimer({
          message: "Next cycle in: ",
          format: "HH:MM:SS",
        });
        await timer.start(nextCycleTime);
      } catch (error) {
        logger.error("Error in automation cycle:", error.message);
        const timer = new CountdownTimer({
          message: "Retrying in: ",
          format: "HH:MM:SS",
        });
        await timer.start(300);
      }
    }
  }
}

// Run automation
const RynusBOT = new Rynus();
RynusBOT.startAutomation().catch((err) => logger.error(err));
