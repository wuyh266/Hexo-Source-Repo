---
title: 可获得的最大点数：逆向思维与定长滑动窗口
categories:
  - 算法学习
tags:
  - C++
  - 滑动窗口
  - 定长滑动窗口
  - 逆向思维
abbrlink: 898b317c
date: 2026-09-25 00:00:00
updated: 2026-09-25 00:00:00
migration_date: 2026-09-25 00:00:00
original_date:
---

> 本文由旧博客内容整理迁入。原发布日期未提供，页面日期为本次整理日期。

## 题目

几张卡牌排成一行，每张卡牌都有一个对应的点数。点数由整数数组 `cardPoints` 给出。

每次行动，你可以从行的开头或者末尾拿一张卡牌，最终必须正好拿 `k` 张卡牌。你的点数就是拿到手中的所有卡牌的点数之和。

给你整数数组 `cardPoints` 和整数 `k`，返回可以获得的最大点数。

### 示例

**示例 1**

```text
输入：cardPoints = [1,2,3,4,5,6,1], k = 3
输出：12
```

解释：第一次行动，不管拿哪张牌，点数都是 1。最优策略是拿右边的三张牌，最终点数为 1 + 6 + 5 = 12。

**示例 2**

```text
输入：cardPoints = [2,2,2], k = 2
输出：4
```

解释：无论拿起哪两张卡牌，可获得的点数总是 4。

**示例 3**

```text
输入：cardPoints = [9,7,7,9,7,7,9], k = 7
输出：55
```

解释：必须拿起所有卡牌，可以获得的点数为所有卡牌的点数之和。

**示例 4**

```text
输入：cardPoints = [1,1000,1], k = 1
输出：1
```

解释：无法拿到中间那张卡牌，所以可以获得的最大点数为 1。

**示例 5**

```text
输入：cardPoints = [1,79,80,1,1,1,200,1], k = 3
输出：202
```

### 提示

- `1 <= cardPoints.length <= 10^5`
- `1 <= cardPoints[i] <= 10^4`
- `1 <= k <= cardPoints.length`

## 解题思路

这个题我们可以用逆向思维来做。既然要求拿到的点数最大，那就求剩下的 `n-k` 张卡牌的最小点数和，再用总和减去它。

从两端拿走卡牌后，剩下的卡牌一定是一段连续区间。这样就直接转换成最简单的定长滑动窗口了。

<!-- more -->

## C++ 题解

```cpp
class Solution {
public:
    int maxScore(vector<int>& cardPoints, int k) {
        int ans=INT_MAX;
        int sum=0;
        int p=cardPoints.size()-k;
        int suml=0;
        for (int i=0;i<cardPoints.size();i++){
            suml=suml+cardPoints[i];
        }
        if(k>=cardPoints.size()){
            return suml;
        }
        for(int i=0;i<cardPoints.size();i++){
            sum=sum+cardPoints[i];
            if(i-p+1<0){
                continue;
            }
            ans=min(ans,sum);
            sum=sum-cardPoints[i-p+1];
        }
        ans=suml-ans;
        return ans;
    }
};
```
