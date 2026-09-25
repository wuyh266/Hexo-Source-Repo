---
title: 尽可能使字符串相等：预算限制下的滑动窗口
categories:
  - 算法学习
tags:
  - C++
  - 滑动窗口
  - 不定长滑动窗口
abbrlink: 5c8a662e
date: 2026-09-25 00:00:00
updated: 2026-09-25 00:00:00
migration_date: 2026-09-25 00:00:00
original_date:
---

> 本文由旧博客内容整理迁入。原发布日期未提供，页面日期为本次整理日期。

## 题目

给你两个长度相同的字符串 `s` 和 `t`。

将 `s` 中的第 `i` 个字符变到 `t` 中的第 `i` 个字符，需要 `|s[i] - t[i]|` 的开销（开销可能为 0），也就是两个字符的 ASCII 码值之差的绝对值。

用于变更字符串的最大预算是 `maxCost`。在转化字符串时，总开销应当小于等于该预算，这也意味着字符串的转化可能是不完全的。

如果可以将 `s` 的子字符串转化为它在 `t` 中对应的子字符串，则返回可以转化的最大长度。如果不存在这样的子字符串，则返回 0。

## 解题思路

这道题主要注意一个地方：字符变换所选的位置必须连续，因此也可以归入滑动窗口这一类。

先计算每个位置的转换开销，再维护区间的开销和。

<!-- more -->

## C++ 题解（保留原实现）

```cpp
class Solution {
public:
    int equalSubstring(string s, string t, int maxCost) {
        int scost=0;
        int ans=0;
        int ans1=0;
        vector<int>arr;
        for(int i=0;i<s.size();i++){
            int ASCIIS=s[i]-'0';
            int ASCIIT=t[i]-'0';
            scost=abs(ASCIIS-ASCIIT);
            arr.push_back(scost);
        }
        int left=0;
        
        for(int i=0;i<s.size();i++){
            ans=ans+arr[i];
            if(ans<=maxCost){
                
            }else{
                ans=ans-arr[left];
                left++;
            }
            ans1=max(ans1,i-left+1);
        }
        return ans1;
    }
};
```

## 整理补注

这里保留了原代码的 `if/else` 写法。它与每轮都用 `while` 收缩到合法窗口的写法不同：预算超出时只移出一个元素，当前窗口可能仍然不合法，但窗口长度不会减小。

由于每个位置的开销非负，窗口长度只有在扩展后的总开销不超过预算时才会增长，因此这份写法可以用于求最大长度；不能直接把每一轮的窗口都当作一个合法答案区间。

另外，计算两个字符的差值时，两边都减去 `'0'` 会相互抵消，因此这里也可以直接计算 `abs(s[i] - t[i])`。
