---
title: 删掉一个元素以后全为 1 的最长子数组
categories:
  - 算法学习
tags:
  - C++
  - 滑动窗口
  - 不定长滑动窗口
abbrlink: c8a9248
date: 2026-09-25 00:00:00
updated: 2026-09-25 00:00:00
migration_date: 2026-09-25 00:00:00
original_date:
---

> 本文由旧博客内容整理迁入。原发布日期未提供，页面日期为本次整理日期。

## 题目

给你一个二进制数组 `nums`，你需要从中删掉一个元素。

请你在删掉元素的结果数组中，返回最长的且只包含 1 的非空子数组的长度。如果不存在这样的子数组，请返回 0。

### 示例

**示例 1**

```text
输入：nums = [1,1,0,1]
输出：3
```

解释：删掉位置 2 的数后，`[1,1,1]` 包含 3 个 1。

**示例 2**

```text
输入：nums = [0,1,1,1,0,1,1,0,1]
输出：5
```

解释：删掉位置 4 的数字后，数组为 `[0,1,1,1,1,1,0,1]`，最长全 1 子数组为 `[1,1,1,1,1]`。

**示例 3**

```text
输入：nums = [1,1,1]
输出：2
```

解释：必须删除一个元素。

## 解题思路

这道题很有意思，处理方式也非常巧妙，但是依旧可以沿用不定长滑动窗口的做法。

维护一个最多包含一个 0 的窗口。因为必须删除一个元素，所以候选答案是窗口长度减一，即 `right-left`。即使整个窗口都是 1，也必须减一。

<!-- more -->

## C++ 题解

```cpp
class Solution {
public:
    int longestSubarray(vector<int>& nums) {
        int left=0;
        int cnt0=0;
        int ans=0;
        for(int right=0;right<nums.size();right++){
            cnt0=cnt0+1-nums[right];
            while(cnt0>1){
                cnt0-=1-nums[left];
                left++;
            }
            ans=max(ans,right-left);
        }
        return ans;

    }
};
```
