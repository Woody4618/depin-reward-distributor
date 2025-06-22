/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/reward_distributor.json`.
 */
export type RewardDistributor = {
  "address": "DGorXzr4L3QetxW6AbD715pt7e5ihU3RXo8Re5D7zNmu",
  "metadata": {
    "name": "rewardDistributor",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "changeAuthority",
      "discriminator": [
        50,
        106,
        66,
        104,
        99,
        118,
        145,
        88
      ],
      "accounts": [
        {
          "name": "rewardAccount",
          "writable": true
        },
        {
          "name": "currentAuthority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "newAuthority",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "changeAuthorityWithDeviceSig",
      "discriminator": [
        241,
        42,
        103,
        225,
        155,
        52,
        24,
        247
      ],
      "accounts": [
        {
          "name": "rewardAccount",
          "writable": true
        },
        {
          "name": "newAuthority",
          "signer": true
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "claimRewards",
      "discriminator": [
        4,
        144,
        132,
        71,
        116,
        23,
        151,
        80
      ],
      "accounts": [
        {
          "name": "rewardAccount",
          "writable": true
        },
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "oracle"
        },
        {
          "name": "mint"
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "treasuryAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "instructions",
          "address": "Sysvar1nstructions1111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "lifetimeRewards",
          "type": "u64"
        },
        {
          "name": "timestamp",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeRewardAccount",
      "discriminator": [
        63,
        186,
        43,
        118,
        242,
        79,
        158,
        232
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "rewardAccount",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "devicePubkey",
          "type": "pubkey"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "rewardAccount",
      "discriminator": [
        225,
        81,
        31,
        253,
        84,
        234,
        171,
        129
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidSignature",
      "msg": "Invalid signature"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6002,
      "name": "invalidRewardAmount",
      "msg": "Invalid reward amount"
    },
    {
      "code": 6003,
      "name": "noRewardsToClaim",
      "msg": "No rewards to claim"
    },
    {
      "code": 6004,
      "name": "rewardOverflow",
      "msg": "Reward overflow"
    },
    {
      "code": 6005,
      "name": "invalidInstruction",
      "msg": "Invalid instruction"
    }
  ],
  "types": [
    {
      "name": "rewardAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "devicePubkey",
            "type": "pubkey"
          },
          {
            "name": "withdrawAuthority",
            "type": "pubkey"
          },
          {
            "name": "totalClaimed",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
