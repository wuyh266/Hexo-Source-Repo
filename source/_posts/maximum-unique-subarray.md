---
title: 删除子数组的最大得分：无重复元素的窗口和
categories:
  - 算法学习
tags:
  - C++
  - 滑动窗口
  - 不定长滑动窗口
  - 哈希表
abbrlink: 6d5b4267
date: 2026-09-25 00:00:00
updated: 2026-09-25 00:00:00
migration_date: 2026-09-25 00:00:00
original_date:
---

> 本文由旧博客内容整理迁入。原发布日期未提供，页面日期为本次整理日期。

## 题目

给你一个正整数数组 `nums`，请从中删除一个含有若干不同元素的子数组。删除子数组的得分就是子数组各元素之和。

返回只删除一个子数组可获得的最大得分。

如果数组 `b` 是数组 `a` 的一个连续子序列，即它等于 `a[l], a[l+1], ..., a[r]`，那么它就是 `a` 的一个子数组。

### 示例

**示例 1**

```text
输入：nums = [4,2,4,5,6]
输出：17
```

解释：最优子数组是 `[2,4,5,6]`。

**示例 2**

```text
输入：nums = [5,2,1,2,5,2,1,2,5]
输出：8
```

解释：最优子数组是 `[5,2,1]` 或 `[1,2,5]`。

## 解题思路

这道题直接见题解，和之前的一样。维护没有重复元素的窗口，同时维护窗口内元素之和，记录最大的和。

<!-- more -->

## C++ 题解

```cpp
class Solution {
public:
    int maximumUniqueSubarray(vector<int>& nums) {
        unordered_map<int,int>arr;
        int ans=0;
        int left=0;
        int res=0;
        for(int i=0;i<nums.size();i++){
            arr[nums[i]]++;
            res=res+nums[i];
            while(arr[nums[i]]>=2){
                arr[nums[left]]--;
                if(arr[nums[left]]==0){
                    arr.erase(nums[left]);
                }
                res=res-nums[left];
                left++;
            }
            ans=max(ans,res);
        }
        return ans;
    }
};
```
