---
title: 每个字符最多出现两次的最长子字符串
categories:
  - 算法学习
tags:
  - C++
  - 滑动窗口
  - 不定长滑动窗口
  - 哈希表
abbrlink: 53dbc00f
date: 2026-09-25 00:00:00
updated: 2026-09-25 00:00:00
migration_date: 2026-09-25 00:00:00
original_date:
---

> 本文由旧博客内容整理迁入。原发布日期未提供，页面日期为本次整理日期。

## 题目

给你一个字符串 `s`，请找出满足每个字符最多出现两次的最长子字符串，并返回该子字符串的最大长度。

### 示例

**示例 1**

```text
输入：s = "bcbbbcba"
输出：4
```

解释：子字符串 `"bcba"` 的长度为 4，其中每个字符最多出现两次。

**示例 2**

```text
输入：s = "aaaa"
输出：2
```

解释：子字符串 `"aa"` 的长度为 2，其中字符 `a` 出现两次。

> 整理说明：原文复制时丢失了示例中对子字符串的突出显示，这里补写实际满足条件的子字符串。

## 解题思路

这道题算是不定长滑动窗口的入门题目了，也是我第一次遇到需要在 `for` 里面用 `while` 循环处理的题目。

之前一直用 `if` 判断，卡了很久。换成 `while` 之后豁然开朗：只要新加入的字符出现次数超过两次，就继续移动左端点，直到窗口恢复合法。

后面几道题目依旧采用这个解法，故而有的文章只给出题解，非必要不再重复文字叙述。

<!-- more -->

## C++ 题解

```cpp
class Solution {
public:
    int maximumLengthSubstring(string s) {
        int ans=0;
        int maxl=0;
        int left=0;
        unordered_map<char,int>nums;
        for(int i=0;i<s.size();i++){
            nums[s[i]]++;
            maxl++;
            while(nums[s[i]]>2){
                maxl--;
                nums[s[left]]--;
                left++;
            }
            ans=max(ans,maxl);
        }
        return ans;
    }
};
```
