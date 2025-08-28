#!/usr/bin/env python3
"""
修复JSON文件中的NaN值
"""

import pandas as pd
import json
import numpy as np
from pathlib import Path

def fix_json():
    """修复JSON文件中的NaN值"""
    try:
        # 读取Excel文件
        df = pd.read_excel('IIR_OCOMM-非活性成分字段描述.xlsx')
        
        print(f"读取到 {len(df)} 行数据")
        
        # 转换为字典列表
        data = []
        for _, row in df.iterrows():
            record = {}
            for col in df.columns:
                value = row[col]
                # 处理各种类型的空值
                if pd.isna(value) or value is None:
                    record[col] = None
                elif isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
                    record[col] = None
                else:
                    record[col] = value
            data.append(record)
        
        # 创建输出目录
        output_dir = Path('web_app')
        output_dir.mkdir(exist_ok=True)
        
        # 保存为JSON文件
        json_file = output_dir / 'data.json'
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"数据已保存到: {json_file}")
        
        # 验证JSON文件
        with open(json_file, 'r', encoding='utf-8') as f:
            test_data = json.load(f)
        
        print(f"JSON文件验证成功，包含 {len(test_data)} 条记录")
        
        return True
        
    except Exception as e:
        print(f"修复过程中出错: {e}")
        return False

if __name__ == "__main__":
    success = fix_json()
    exit(0 if success else 1)
