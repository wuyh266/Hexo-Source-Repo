---
title: 使数组平衡的最少移除数：排序与逆向思维
categories:
  - 算法学习
tags:
  - C++
  - 滑动窗口
  - 不定长滑动窗口
  - 排序
  - 逆向思维
abbrlink: a0e8d0ca
date: 2026-09-25 00:00:00
updated: 2026-09-25 00:00:00
migration_date: 2026-09-25 00:00:00
original_date:
---

> 本文由旧博客内容整理迁入。原发布日期未提供，页面日期为本次整理日期。

## 题目

给你一个整数数组 `nums` 和一个整数 `k`。

如果一个数组的最大元素的值至多是其最小元素的 `k` 倍，则该数组被称为平衡的。

你可以从 `nums` 中移除任意数量的元素，但不能使其变为空数组。返回为了使剩余数组平衡，需要移除的元素的最小数量。

注意：大小为 1 的数组被认为是平衡的，因为其最大值和最小值相等，且条件总是成立。

### 示例

**示例 1**

```text
输入：nums = [2,1,5], k = 2
输出：1
```

解释：移除 `nums[2] = 5`，得到 `[2,1]`。此时最大值为 2、最小值为 1，满足 `2 <= 1 * 2`。

**示例 2**

```text
输入：nums = [1,6,2,9], k = 3
输出：2
```

解释：移除 `nums[0] = 1` 和 `nums[3] = 9`，得到 `[6,2]`，满足 `6 <= 2 * 3`。

**示例 3**

```text
输入：nums = [4,6], k = 2
输出：0
```

解释：由于 `6 <= 4 * 2`，数组已经平衡，不需要移除任何元素。

## 解题思路

这道题属于一手逆向思维。题目要求删掉的最少数量，那就直接求最多能保留的数量，再用总数减去它。

排序之后，用滑动窗口找到满足“最大值不超过最小值的 `k` 倍”的最长区间。

<!-- more -->

## C++ 题解

```cpp
class Solution {
public:
    int minRemoval(vector<int>& nums, int k) {
        int left=0;
        int maxl=0;
        int minl=0;
        int max_save=0;
        ranges::sort(nums);
        long long y=1;
        for(int right=0;right<nums.size();right++){
            
            while(y*nums[left]*k<nums[right]){
                left++;
            }
            max_save=max(max_save,right-left+1);
        }
        return nums.size()-max_save;
    }
};
```

在 `while` 里面乘一个 `long long` 类型的 `y`，是为了触发隐式类型转换，避免乘法结果超出 `int` 范围。

代码中的 `ranges::sort` 需要 C++20 或更新标准。
