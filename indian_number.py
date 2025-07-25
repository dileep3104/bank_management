def number_converter(nums):
    num=str(nums)
    if '.' in num:
        integer,decimal=num.split(".")
    elif '.' not in num:
        integer=num
    decimal_num="."+decimal
    if len(integer)<3:
             return integer+decimal_num
    end_nums=integer[-3:]
    remaing=integer[:-3]
    new_nums=''
    while len(remaing)>2:
         new_nums+=','+remaing[-2:]+new_nums
         remaing=remaing[:-2]
    if remaing:
         new_nums=remaing+new_nums
    return new_nums+','+end_nums+decimal_num          

number=float(input("enter the number : "))
print(number_converter(number))