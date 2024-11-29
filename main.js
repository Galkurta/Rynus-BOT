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
  MAX_POWER: 20,
  POWER_RECOVERY_TIME: 20,
  DEFAULT_REWARD: 2500,
  TASK_TEMPLATE: {
    taskId: 132,
    data: [
      {
        words: [{ id: 1, word: "Supported" }],
        topic: "sw",
        groupId: "173285861200",
      },
    ],
  },
};

class Rynus {
  constructor() {
    this.accounts = new Map();
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

  async getUserInfo(account) {
    try {
      const response = await axios.get(
        `${API_CONFIG.BASE_URL}/api/user/get-info-by-telegram-id`,
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
      return response.data.data;
    } catch (error) {
      logger.error("Error getting user info:", error.message);
      return null;
    }
  }

  async getMissionsList(account, userInfo) {
    try {
      const response = await axios.get(
        `${API_CONFIG.BASE_URL}/api/user-mission/get-user-missions`,
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
      `${colors.accountInfo}User Power: ${userInfo.userPower}${colors.reset}`
    );
    logger.info(
      `${colors.accountInfo}User Role: ${userInfo.userRole}${colors.reset}`
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
        `${API_CONFIG.BASE_URL}/api/user-mission/update-missions-status/${mission.id}/${userInfo.userCode}`,
        { umId: mission.id, userId: userInfo.userCode },
        { headers: this.getHeaders(account) }
      );

      await this.delay(REQUEST_CONFIG.DELAY);

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
      let currentPower = userInfo.userPower;
      let taskCount = 0;
      let initialBalance = userInfo.extraBalanceRental;
      let currentBalance = initialBalance;

      logger.info(
        `${colors.accountInfo}Initial Balance: ${initialBalance}${colors.reset}`
      );
      logger.info(
        `${colors.accountInfo}Initial Power: ${currentPower}/${LABELING_CONFIG.MAX_POWER}${colors.reset}`
      );

      const initialPayload = {
        authData: account.userData,
        labelResult: JSON.stringify(LABELING_CONFIG.TASK_TEMPLATE),
        nextKey: null,
        reward: LABELING_CONFIG.DEFAULT_REWARD,
        taskId: 0,
        taskStatus: 2,
        taskType: 2,
        userId: userInfo.id,
      };

      const initialResponse = await axios.post(
        `${API_CONFIG.BASE_URL}/api/user-label-task/create-user-label-task`,
        initialPayload,
        { headers: this.getHeaders(account) }
      );

      if (!initialResponse.data?.data?.nextKey) {
        logger.warn("Cannot start labeling task: No task key available");
        return userInfo;
      }

      let nextKey = initialResponse.data.data.nextKey;

      while (taskCount < LABELING_CONFIG.MAX_TASKS) {
        if (currentPower < LABELING_CONFIG.POWER_REQUIRED) {
          const powerNeeded = LABELING_CONFIG.POWER_REQUIRED - currentPower;
          const waitTimeMinutes =
            powerNeeded * LABELING_CONFIG.POWER_RECOVERY_TIME;
          logger.warn(
            `Waiting ${waitTimeMinutes} minutes for power recovery...`
          );

          const timer = new CountdownTimer({
            message: "Power recovery: ",
            format: "HH:MM:SS",
          });
          await timer.start(waitTimeMinutes * 60);

          currentPower = Math.min(
            LABELING_CONFIG.MAX_POWER,
            currentPower + powerNeeded
          );
          logger.info(
            `${colors.taskInProgress}Power recovered to ${currentPower}/${LABELING_CONFIG.MAX_POWER}${colors.reset}`
          );
        }

        try {
          const payload = {
            ...initialPayload,
            nextKey,
          };

          const response = await axios.post(
            `${API_CONFIG.BASE_URL}/api/user-label-task/create-user-label-task`,
            payload,
            { headers: this.getHeaders(account) }
          );

          if (response.data?.data?.nextKey) {
            nextKey = response.data.data.nextKey;
            currentBalance = response.data.data.bonusBalance;
            taskCount++;
            currentPower -= LABELING_CONFIG.POWER_REQUIRED;

            logger.success(`Completed labeling task ${taskCount}`);
            logger.info(
              `${colors.accountInfo}Current Balance: ${currentBalance} (+${
                currentBalance - initialBalance
              })${colors.reset}`
            );
            logger.info(
              `${colors.accountInfo}Remaining Power: ${currentPower}/${LABELING_CONFIG.MAX_POWER}${colors.reset}`
            );
          } else {
            logger.warn("No more tasks available");
            break;
          }

          await this.delay(REQUEST_CONFIG.DELAY);
        } catch (error) {
          logger.error("Error in labeling task:", error.message);
          break;
        }
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
        `${API_CONFIG.BASE_URL}/api/user/update-user-last-heart-beat?userId=${userInfo.id}`,
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

        logger.info(
          `${colors.menuTitle}All accounts processed. Waiting 1 hour before next cycle...${colors.reset}`
        );
        const timer = new CountdownTimer({
          message: "Next cycle in: ",
          format: "HH:MM:SS",
        });
        await timer.start(3600);
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
